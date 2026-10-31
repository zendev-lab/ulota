import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { createOwnerSession } from "./auth.ts";
const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./db.ts", () => ({ getDatabase: () => state.db }));
import { requirePersonalUser } from "./personal-auth.ts";
let db: ReturnType<typeof openMemoryDatabase>;
beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db);
  state.db = db;
});
afterEach(() => db.close());
it("requires an actual user session instead of synthesizing a local owner", () => {
  expect(() => requirePersonalUser(null)).toThrow();
  expect(db.prepare("SELECT count(*) AS count FROM users").get()).toMatchObject({ count: 0 });
  const owner = createOwnerSession(db, "Owner", null);
  expect(() => requirePersonalUser(null)).toThrow();
  expect(requirePersonalUser(owner.sessionToken)).toBe(owner.userId);
  db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(owner.userId);
  expect(() => requirePersonalUser(owner.sessionToken)).toThrow();
});
