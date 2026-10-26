import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { resolveSparkPaths } from "@zendev-lab/spark-platform-node";
import {
  createId,
  parseSparkInteractionRequest,
  runtimeProtocolVersion,
  serverCommandEnvelopeSchema,
} from "@zendev-lab/spark-protocol";
import { executeClaimedCommand } from "./claimed-command.ts";
import type { MessageContext } from "./daemon.ts";
import { createDaemonSessionRegistry } from "./session-registry.ts";
import { SparkDaemonHumanInteractionBroker } from "./core/human-interactions.ts";
import { SparkDaemonHumanWaitRegistry } from "./core/human-waits.ts";
import { migrateSparkDaemonDatabase } from "./store/schema.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "ulota-remote-human-"));
  const db = new DatabaseSync(":memory:");
  cleanups.push(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  migrateSparkDaemonDatabase(db);
  const runtimeId = createId("rt");
  const paths = resolveSparkPaths({ app: "daemon", sparkHome: root });
  const sessionRegistry = createDaemonSessionRegistry(root, { daemonId: runtimeId });
  const sessions = await Promise.all(
    [0, 1].map(() => sessionRegistry.create({ scope: { kind: "daemon" }, purpose: "personal" })),
  );
  const waits = new SparkDaemonHumanWaitRegistry(db);
  const broker = new SparkDaemonHumanInteractionBroker({
    db,
    waits,
    getRuntimeId: () => runtimeId,
  });
  for (const session of sessions)
    await broker.interact(
      parseSparkInteractionRequest({
        requestId: createId("hreq"),
        kind: "askFlow",
        source: "daemon",
        delivery: "async",
        title: "Choose",
        prompt: "Continue?",
        mode: "decision",
        questions: [
          {
            id: "choice",
            prompt: "Continue?",
            type: "single",
            required: true,
            options: [{ value: "yes", label: "Continue" }],
          },
        ],
      }),
      { sessionId: session.sessionId, invocationId: createId("inv"), sessionSource: "web" },
    );
  const context: MessageContext = {
    paths,
    db,
    runtimeId,
    sparkHome: root,
    sessionRegistry,
    humanWaits: waits,
    respondHumanInteraction: broker.respond.bind(broker),
    config: { installationId: "human-test", displayName: "Test" },
    runtimeSessionId: undefined,
    setRuntimeSessionId() {},
    ensureHeartbeat() {},
    runSparkCommand: async () => {
      throw new Error("Human commands must use the interaction owner");
    },
    cancelSparkInvocation: async () => ({
      invocationId: "unused",
      cancelled: false,
      message: "unused",
    }),
  };
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const ws = {
    send(data: string) {
      sent.push(JSON.parse(data));
    },
  };
  async function command(
    kind: "human.request.list.request" | "human.response.deliver.request",
    sessionId: string | undefined,
    payload: Record<string, unknown> = {},
  ) {
    await executeClaimedCommand(
      ws,
      serverCommandEnvelopeSchema.parse({
        protocolVersion: runtimeProtocolVersion,
        messageId: createId("msg"),
        type: "server.command",
        sentAt: new Date().toISOString(),
        runtimeId,
        commandId: createId("cmd"),
        sessionId,
        payload: { kind, scope: "daemon", payload },
      }),
      context,
    );
    return sent.findLast((message) => message.type === "runtime.command.result")?.payload.result;
  }
  return { sessions, waits, command };
}

it("lists and settles only the routed session's durable questions, including replay", async () => {
  const { sessions, waits, command } = await setup();
  const sessionId = sessions[0]!.sessionId;
  const wait = waits.listPending().find((wait) => wait.sessionId === sessionId)!;
  await expect(command("human.request.list.request", sessionId)).resolves.toMatchObject({
    waits: [expect.objectContaining({ humanRequestId: wait.humanRequestId, sessionId })],
  });
  const answer = {
    humanRequestId: wait.humanRequestId,
    humanResponseId: createId("hres"),
    status: "answered",
    answers: { choice: { values: ["yes"] } },
  };
  await expect(command("human.response.deliver.request", sessionId, answer)).resolves.toMatchObject(
    { outcome: "accepted" },
  );
  await expect(command("human.response.deliver.request", sessionId, answer)).resolves.toMatchObject(
    { outcome: "replayed" },
  );
  expect(waits.listPending().map((wait) => wait.sessionId)).toEqual([sessions[1]!.sessionId]);
  expect(waits.listPendingOutbox()).toEqual([]);
});

it("rejects missing routes, forged provenance, and answers for another session", async () => {
  const { sessions, waits, command } = await setup();
  const sessionId = sessions[0]!.sessionId;
  const other = waits.listPending().find((wait) => wait.sessionId !== sessionId)!;
  await expect(command("human.request.list.request", undefined)).rejects.toMatchObject({
    code: "session_scope_mismatch",
  });
  await expect(
    command("human.request.list.request", sessionId, { sessionId: other.sessionId }),
  ).rejects.toMatchObject({ code: "session_scope_mismatch" });
  await expect(
    command("human.response.deliver.request", sessionId, {
      humanRequestId: other.humanRequestId,
      status: "cancelled",
      provenance: "system",
    }),
  ).rejects.toMatchObject({ code: "human_interaction_forbidden" });
  await expect(
    command("human.response.deliver.request", sessionId, {
      humanRequestId: other.humanRequestId,
      status: "cancelled",
    }),
  ).rejects.toMatchObject({ code: "human_interaction_not_found" });
  expect(waits.listPending()).toHaveLength(2);
});
