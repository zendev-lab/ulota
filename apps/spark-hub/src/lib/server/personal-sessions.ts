import { createHash } from "node:crypto";
import {
  sparkLocalRpcProcedureSchemas,
  type SparkLocalRpcParsedInput,
} from "@zendev-lab/spark-protocol/local-rpc-orpc-contract";
import { userHasDaemonGrant } from "@zendev-lab/spark-hub-coordination/hub-access";
import { error } from "@sveltejs/kit";
import {
  createId,
  sparkAskQuestionViewSchema,
  parseSparkSessionProjection,
  type SparkSessionProjection,
} from "@zendev-lab/spark-protocol";
import {
  runRuntimeSessionControlCommand,
  runtimeSessionRouteForRuntime,
  getRuntimeSessionProjection,
} from "@zendev-lab/spark-hub-coordination/runtime-session-control";
import { getDatabase } from "./db.ts";
import { createHubRuntimeSessionClient } from "./hub-runtime-session-client.ts";
import { submitConversationTurnForHub } from "./conversation-control.ts";

export async function createPersonalConversation(
  userId: string,
  bindingId: string,
  sessionId = createId("sess"),
) {
  const db = getDatabase();
  const binding = db
    .prepare(
      "SELECT runtime_id AS runtimeId FROM personal_bindings WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND credential_hash IS NOT NULL",
    )
    .get(bindingId, userId) as { runtimeId: string } | undefined;
  if (!binding || !userHasDaemonGrant(db, { userId, runtimeId: binding.runtimeId }))
    error(403, "An active personal device binding is required.");
  const claimed = db
    .prepare(
      "SELECT user_id AS userId, binding_id AS bindingId FROM personal_sessions WHERE session_id = ?",
    )
    .get(sessionId) as { userId: string; bindingId: string } | undefined;
  const existing = getRuntimeSessionProjection(db, sessionId);
  if (claimed && (claimed.userId !== userId || claimed.bindingId !== bindingId))
    error(409, "Personal session identity is already in use.");
  if (
    existing &&
    (!claimed ||
      existing.runtimeId !== binding.runtimeId ||
      existing.session.purpose !== "personal" ||
      existing.session.scope.kind !== "daemon")
  )
    error(409, "Session identity is already in use.");
  db.prepare(
    "INSERT OR IGNORE INTO personal_sessions (session_id, user_id, binding_id, runtime_id, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(sessionId, userId, bindingId, binding.runtimeId, new Date().toISOString());
  if (existing) return existing.session;
  const result = await runRuntimeSessionControlCommand(db, {
    route: runtimeSessionRouteForRuntime(binding.runtimeId),
    sessionId,
    idempotencyKey: personalCommandIdempotencyKey(sessionId, "create"),
    payload: {
      kind: "session.create.request",
      payload: { sessionId, scope: { kind: "daemon" }, purpose: "personal" },
    },
  });
  return parseSparkSessionProjection(result.session);
}

export function requirePersonalConversation(userId: string, sessionId: string) {
  const row = getDatabase()
    .prepare(
      "SELECT s.runtime_id AS runtimeId, s.binding_id AS bindingId FROM personal_sessions s JOIN personal_bindings b ON b.id = s.binding_id WHERE s.session_id = ? AND s.user_id = ? AND b.user_id = s.user_id AND b.revoked_at IS NULL AND b.credential_hash IS NOT NULL",
    )
    .get(sessionId, userId) as { runtimeId: string; bindingId: string } | undefined;
  if (!row || !userHasDaemonGrant(getDatabase(), { userId, runtimeId: row.runtimeId }))
    error(404, "Personal conversation not found.");
  const projection = getRuntimeSessionProjection(getDatabase(), sessionId);
  if (
    projection &&
    (projection.runtimeId !== row.runtimeId ||
      projection.session.purpose !== "personal" ||
      projection.session.scope.kind !== "daemon")
  )
    error(409, "Personal session route does not match its owner.");
  return row;
}

export async function personalConversationSnapshot(userId: string, sessionId: string) {
  requirePersonalConversation(userId, sessionId);
  return createHubRuntimeSessionClient().snapshot(sessionId, { messageLimit: 100 });
}

export async function submitPersonalConversation(
  userId: string,
  sessionId: string,
  prompt: string,
  submissionId: string,
) {
  requirePersonalConversation(userId, sessionId);
  return submitConversationTurnForHub({
    sessionId,
    prompt,
    submissionId,
    title: prompt.slice(0, 100),
  });
}

export function listPersonalConversations(userId: string) {
  return (
    getDatabase()
      .prepare(`SELECT p.session_id AS sessionId, r.record_json AS record FROM personal_sessions p
    LEFT JOIN runtime_session_projections r ON r.session_id = p.session_id AND r.runtime_id = p.runtime_id
    WHERE p.user_id = ? ORDER BY p.created_at DESC`)
      .all(userId) as { sessionId: string; record: string | null }[]
  ).map((row) => ({
    sessionId: row.sessionId,
    session: row.record ? (JSON.parse(row.record) as SparkSessionProjection) : null,
  }));
}

export async function personalConversationInteractions(userId: string, sessionId: string) {
  const { runtimeId } = requirePersonalConversation(userId, sessionId);
  const result = await runRuntimeSessionControlCommand(getDatabase(), {
    route: runtimeSessionRouteForRuntime(runtimeId),
    sessionId,
    payload: { kind: "human.request.list.request", payload: { sessionId } },
  });
  return sparkLocalRpcProcedureSchemas["human.interaction.list"].output
    .parse(result)
    .waits.map((wait) => ({
      humanRequestId: wait.humanRequestId,
      humanResponseId: createId("hres"),
      title: wait.title,
      prompt: wait.prompt,
      mode: wait.mode,
      questions: sparkAskQuestionViewSchema.array().min(1).parse(wait.questions),
    }));
}

export async function respondPersonalConversationInteraction(
  userId: string,
  sessionId: string,
  input: Pick<
    SparkLocalRpcParsedInput<"human.interaction.respond">,
    "humanRequestId" | "humanResponseId" | "status" | "answers"
  >,
) {
  const { runtimeId } = requirePersonalConversation(userId, sessionId);
  const result = await runRuntimeSessionControlCommand(getDatabase(), {
    route: runtimeSessionRouteForRuntime(runtimeId),
    sessionId,
    idempotencyKey: input.humanResponseId
      ? personalCommandIdempotencyKey(sessionId, "respond", input.humanResponseId)
      : undefined,
    payload: {
      kind: "human.response.deliver.request",
      payload: { ...input, sessionId, provenance: "direct_user" },
    },
  });
  const response = sparkLocalRpcProcedureSchemas["human.interaction.respond"].output.parse(result);
  if (response.outcome !== "accepted" && response.outcome !== "replayed")
    error(409, response.message);
  return response;
}

function personalCommandIdempotencyKey(
  sessionId: string,
  action: "create" | "respond",
  responseId?: string,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(["personal-session", sessionId, action, responseId]))
    .digest("hex")
    .slice(0, 32);
  return `idem_${digest}`;
}
