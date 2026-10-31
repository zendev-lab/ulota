import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { setPersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import type { PersonalCapability } from "@zendev-lab/spark-protocol";
export function createPersonalTestDatabase(capabilities: readonly PersonalCapability[]) {
  const db = openMemoryDatabase();
  migrate(db);
  const now = new Date().toISOString();
  for (const id of ["alice", "bob"]) {
    db.prepare(
      "INSERT INTO users (id,display_name,role,status,created_at,updated_at) VALUES (?,?,'owner','active',?,?)",
    ).run(id, id, now, now);
    for (const capability of capabilities) setPersonalCapability(db, id, capability, true);
  }
  return db;
}
