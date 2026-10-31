import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
const tables = {
  inventory: "personal_inventory",
  todos: "personal_todos",
  subscriptions: "personal_subscriptions",
} as const;
export type PersonalRecordTable = keyof typeof tables;
export interface PersonalStoredRecord {
  id: string;
  revision: number;
  updated_at: string;
}
function conflict() {
  return Object.assign(
    new Error("The record changed elsewhere. Review the latest version before retrying."),
    { code: "conflict" },
  );
}
export function createPersonalRecordRepository<T extends PersonalStoredRecord>(
  db: DatabaseSync,
  capability: PersonalRecordTable,
  userId: string,
  decode: (value: unknown) => T,
) {
  const table = tables[capability];
  return {
    list(): T[] {
      return (
        db
          .prepare(
            `SELECT record_json AS record FROM ${table} WHERE user_id = ? ORDER BY updated_at DESC, record_id ASC`,
          )
          .all(userId) as { record: string }[]
      ).map((row) => decode(JSON.parse(row.record)));
    },
    get(id: string): T | undefined {
      const row = db
        .prepare(`SELECT record_json AS record FROM ${table} WHERE user_id = ? AND record_id = ?`)
        .get(userId, id) as { record: string } | undefined;
      return row ? decode(JSON.parse(row.record)) : undefined;
    },
    insert(record: T) {
      const changed = db
        .prepare(
          `INSERT OR IGNORE INTO ${table} (user_id, record_id, revision, updated_at, record_json) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(userId, record.id, record.revision, record.updated_at, JSON.stringify(record));
      if (changed.changes !== 1) throw conflict();
    },
    replace(record: T, expectedRevision: number) {
      const changed = db
        .prepare(
          `UPDATE ${table} SET revision = ?, updated_at = ?, record_json = ? WHERE user_id = ? AND record_id = ? AND revision = ?`,
        )
        .run(
          record.revision,
          record.updated_at,
          JSON.stringify(record),
          userId,
          record.id,
          expectedRevision,
        );
      if (changed.changes !== 1) throw conflict();
    },
    remove(id: string, expectedRevision: number) {
      if (
        db
          .prepare(`DELETE FROM ${table} WHERE user_id = ? AND record_id = ? AND revision = ?`)
          .run(userId, id, expectedRevision).changes !== 1
      )
        throw conflict();
    },
  };
}

export function withPersonalOperation<T>(
  db: DatabaseSync,
  userId: string,
  operationId: string,
  request: unknown,
  execute: () => T,
): T {
  const hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db
      .prepare(
        "SELECT request_hash AS hash, result_json AS result FROM personal_operation_receipts WHERE user_id = ? AND operation_id = ?",
      )
      .get(userId, operationId) as { hash: string; result: string } | undefined;
    if (previous) {
      if (previous.hash !== hash) throw conflict();
      db.exec("COMMIT");
      return JSON.parse(previous.result) as T;
    }
    const result = execute();
    db.prepare(
      "INSERT INTO personal_operation_receipts (user_id, operation_id, request_hash, result_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, operationId, hash, JSON.stringify(result), new Date().toISOString());
    db.exec("COMMIT");
    return result;
  } catch (caught) {
    db.exec("ROLLBACK");
    throw caught;
  }
}
