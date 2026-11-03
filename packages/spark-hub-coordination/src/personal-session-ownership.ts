import type { DatabaseSync } from "node:sqlite";
export function personalSessionOwner(db: DatabaseSync, sessionId: string): string | undefined {
  const visited = new Set<string>();
  while (!visited.has(sessionId)) {
    visited.add(sessionId);
    const direct = db
      .prepare("SELECT user_id AS userId FROM personal_sessions WHERE session_id = ?")
      .get(sessionId) as { userId: string } | undefined;
    if (direct) return direct.userId;
    const row = db
      .prepare(
        "SELECT record_json AS record FROM runtime_session_projections WHERE session_id = ? LIMIT 1",
      )
      .get(sessionId) as { record: string } | undefined;
    if (!row) return undefined;
    const session = JSON.parse(row.record);
    if (session.purpose === "personal") return "unclaimed-personal-session";
    if (session.lineage?.kind !== "child") return undefined;
    sessionId = session.lineage.parentSessionId;
  }
  return undefined;
}
