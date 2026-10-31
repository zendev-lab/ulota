import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { parseSparkSessionProjection } from "@zendev-lab/spark-protocol";
import { submitRuntimeControlCommand } from "@zendev-lab/spark-hub-coordination";
const state = vi.hoisted(() => ({ db: undefined as unknown, command: vi.fn() }));
vi.mock("./db.ts", () => ({ getDatabase: () => state.db }));
vi.mock("@zendev-lab/spark-hub-coordination/runtime-session-control", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@zendev-lab/spark-hub-coordination/runtime-session-control")
  >()),
  runRuntimeSessionControlCommand: state.command,
}));
import {
  createPersonalConversation,
  requirePersonalConversation,
  personalConversationInteractions,
  respondPersonalConversationInteraction,
} from "./personal-sessions.ts";
let db: ReturnType<typeof openMemoryDatabase>;
const now = new Date().toISOString();
beforeEach(() => {
  state.command.mockReset();
  db = openMemoryDatabase();
  migrate(db);
  state.db = db;
  db.prepare(
    `INSERT INTO users (id, display_name, role, status, created_at, updated_at) VALUES ('alice', 'Alice', 'owner', 'active', ?, ?)`,
  ).run(now, now);
  for (const id of ["a", "b"])
    db.prepare(
      `INSERT INTO runtime_connections (id, name, status, created_at, updated_at) VALUES (?, ?, 'online', ?, ?)`,
    ).run(id, id, now, now);
  db.prepare(
    `INSERT INTO user_daemon_grants (id, user_id, runtime_id, granted_by_user_id, created_at) VALUES ('grant', 'alice', 'a', 'alice', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO personal_bindings (id, hub_instance_id, user_id, runtime_id, local_owner_id, pairing_expires_at, credential_hash, created_at) VALUES ('binding', 'hub', 'alice', 'a', 'owner', ?, 'secret-hash', ?)`,
  ).run(now, now);
});

it("authorizes personal interaction reads and answers before contacting the daemon", async () => {
  db.prepare(
    "INSERT INTO personal_sessions (session_id, user_id, binding_id, runtime_id, created_at) VALUES ('private', 'alice', 'binding', 'a', ?)",
  ).run(now);
  const answer = {
    humanRequestId: "question",
    humanResponseId: "response",
    status: "cancelled" as const,
    answers: {},
  };
  for (const user of ["bob", "alice"]) {
    if (user === "alice")
      db.prepare("UPDATE user_daemon_grants SET revoked_at = ? WHERE id = 'grant'").run(now);
    await expect(personalConversationInteractions(user, "private")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      respondPersonalConversationInteraction(user, "private", answer),
    ).rejects.toMatchObject({ status: 404 });
  }
  expect(state.command).not.toHaveBeenCalled();
});

it("projects only question fields and fixes answers to the authorized personal route", async () => {
  db.prepare(
    "INSERT INTO personal_sessions (session_id, user_id, binding_id, runtime_id, created_at) VALUES ('private', 'alice', 'binding', 'a', ?)",
  ).run(now);
  const questions = [
    {
      id: "choice",
      prompt: "Continue?",
      type: "single",
      required: true,
      options: [{ value: "yes", label: "Continue" }],
    },
  ];
  state.command.mockResolvedValueOnce({
    waits: [
      {
        humanRequestId: "question",
        interactionRequestId: "interaction",
        sessionId: "private",
        invocationId: "invocation",
        workspaceBindingId: "",
        workspaceId: "",
        projectId: "",
        toolCallId: "",
        delivery: "async",
        kind: "ask_user",
        title: "Choose",
        prompt: "Continue?",
        questions,
        context: { privatePath: "/hidden/path" },
        contextArtifactRefs: ["evidence:hidden"],
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  const projected = await personalConversationInteractions("alice", "private");
  expect(projected).toEqual([
    {
      humanRequestId: "question",
      humanResponseId: expect.stringMatching(/^hres_/u),
      title: "Choose",
      prompt: "Continue?",
      mode: undefined,
      questions: questions.map((question) => ({ ...question, defaultValues: [] })),
    },
  ]);
  const responseId = projected[0]!.humanResponseId;
  state.command.mockResolvedValueOnce({
    outcome: "accepted",
    retryable: false,
    returnedToTool: false,
    message: "Accepted",
  });
  await respondPersonalConversationInteraction("alice", "private", {
    humanRequestId: "question",
    humanResponseId: responseId,
    status: "answered",
    answers: { choice: { values: ["yes"] } },
  });
  expect(state.command).toHaveBeenLastCalledWith(
    db,
    expect.objectContaining({
      route: { scope: "daemon", runtimeId: "a" },
      sessionId: "private",
      idempotencyKey: expect.stringMatching(/^idem_[a-f0-9]{32}$/u),
      payload: {
        kind: "human.response.deliver.request",
        payload: expect.objectContaining({
          sessionId: "private",
          provenance: "direct_user",
          humanResponseId: responseId,
        }),
      },
    }),
  );
});

it("queues create and answer retries once through the real runtime command validator", async () => {
  state.command.mockImplementation(async (database, input) => {
    submitRuntimeControlCommand(database, {
      runtimeId: input.route.runtimeId,
      sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey,
      payload: { ...input.payload, scope: input.route.scope },
    });
    throw new Error("Simulated lost daemon response");
  });
  const sessionId = "sess_" + "c".repeat(32);
  for (let retry = 0; retry < 2; retry++) {
    await expect(createPersonalConversation("alice", "binding", sessionId)).rejects.toThrow(
      "Simulated lost daemon response",
    );
    await expect(
      respondPersonalConversationInteraction("alice", sessionId, {
        humanRequestId: "question",
        humanResponseId: "hres_" + "d".repeat(32),
        status: "cancelled",
        answers: {},
      }),
    ).rejects.toThrow("Simulated lost daemon response");
  }
  const commands = db
    .prepare("SELECT kind, idempotency_key AS key FROM runtime_control_commands ORDER BY kind")
    .all();
  expect(commands).toEqual([
    { kind: "human.response.deliver.request", key: expect.stringMatching(/^idem_[a-f0-9]{32}$/u) },
    { kind: "session.create.request", key: expect.stringMatching(/^idem_[a-f0-9]{32}$/u) },
  ]);
});
afterEach(() => db.close());
it("rejects claiming an existing personal session on another daemon without leaving an ownership row", async () => {
  const sessionId = "sess_" + "a".repeat(32);
  const session = parseSparkSessionProjection({
    sessionId,
    scope: { kind: "daemon", daemonId: "b" },
    lifecycle: "open",
    placement: "active",
    activity: "idle",
    lifetime: "persistent",
    roleBinding: { kind: "none" },
    lineage: { kind: "root" },
    incarnation: 1,
    visibility: "owner",
    retention: "retain",
    purpose: "personal",
    cwd: "/private/personal",
    bindings: [],
    createdAt: now,
    updatedAt: now,
  });
  db.prepare(
    `INSERT INTO runtime_session_projections (runtime_id, session_id, scope, lifecycle, placement, activity, lifetime, lineage_origin_kind, record_json, projected_at) VALUES ('b', ?, 'daemon', 'open', 'active', 'idle', 'persistent', 'root', ?, ?)`,
  ).run(sessionId, JSON.stringify(session), now);
  await expect(createPersonalConversation("alice", "binding", sessionId)).rejects.toThrow();
  expect(db.prepare("SELECT count(*) AS count FROM personal_sessions").get()).toMatchObject({
    count: 0,
  });
});
it("rejects a revoked binding or removed daemon grant before reading or submitting a personal session", () => {
  db.prepare(
    "INSERT INTO personal_sessions (session_id, user_id, binding_id, runtime_id, created_at) VALUES ('private', 'alice', 'binding', 'a', ?)",
  ).run(now);
  expect(requirePersonalConversation("alice", "private")).toMatchObject({ runtimeId: "a" });
  db.prepare("UPDATE personal_bindings SET revoked_at = ? WHERE id = 'binding'").run(now);
  expect(() => requirePersonalConversation("alice", "private")).toThrow();
  db.prepare("UPDATE personal_bindings SET revoked_at = NULL WHERE id = 'binding'").run();
  db.prepare("UPDATE user_daemon_grants SET revoked_at = ? WHERE id = 'grant'").run(now);
  expect(() => requirePersonalConversation("alice", "private")).toThrow();
});
