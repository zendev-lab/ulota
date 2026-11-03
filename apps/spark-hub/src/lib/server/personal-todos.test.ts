import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { setPersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import { personalTodoSchema } from "@zendev-lab/spark-protocol";
const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./db.ts", () => ({ getDatabase: () => state.db }));
import { executeHostedPersonalCapability, todoRepositoryForUser } from "./personal-catalog.ts";
import { personalTodoSnapshot } from "@zendev-lab/ulota-personal-todos";
let db: ReturnType<typeof openMemoryDatabase>;
beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db);
  state.db = db;
  const now = new Date().toISOString();
  for (const id of ["alice", "bob"]) {
    db.prepare(
      "INSERT INTO users (id,display_name,role,status,created_at,updated_at) VALUES (?,?,'owner','active',?,?)",
    ).run(id, id, now, now);
    setPersonalCapability(db, id, "todos", true);
  }
});
afterEach(() => db.close());
function create(title: string, input: Record<string, unknown> = {}) {
  return personalTodoSchema.parse(
    executeHostedPersonalCapability("alice", "todos", {
      action: "create",
      input: { title, ...input },
      operationId: `create-${title}`,
    }),
  );
}
function update(
  id: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
  operationId: string = crypto.randomUUID(),
) {
  return personalTodoSchema.parse(
    executeHostedPersonalCapability("alice", "todos", {
      action: "update",
      input: { id, expectedRevision, patch },
      operationId,
    }),
  );
}
it("validates parent and dependency graphs atomically, including cross-owner references", () => {
  const parent = create("Plan");
  const child = create("Implement", { parent_id: parent.id, dependencies: [parent.id] });
  expect(() => update(parent.id, 1, { parent_id: child.id })).toThrow(/cycle/);
  expect(() => update(parent.id, 1, { dependencies: [child.id] })).toThrow(/cycle/);
  expect(() => update(child.id, 1, { dependencies: [child.id] })).toThrow(/cycle/);
  expect(() => create("Missing", { dependencies: ["missing"] })).toThrow(/does not exist/);
  expect(() =>
    executeHostedPersonalCapability("bob", "todos", {
      action: "create",
      input: { title: "Other", parent_id: parent.id },
      operationId: "other",
    }),
  ).toThrow(/does not exist/);
  expect(todoRepositoryForUser("bob").list()).toHaveLength(0);
  expect(todoRepositoryForUser("alice").get(parent.id)?.revision).toBe(1);
  expect(() =>
    executeHostedPersonalCapability("alice", "todos", {
      action: "delete",
      input: { id: parent.id, expectedRevision: 1 },
      operationId: "delete",
    }),
  ).toThrow(/references/);
  update(child.id, 1, { parent_id: null, dependencies: [] });
  executeHostedPersonalCapability("alice", "todos", {
    action: "delete",
    input: { id: parent.id, expectedRevision: 1 },
    operationId: "delete-cleared",
  });
  expect(todoRepositoryForUser("alice").list()).toHaveLength(1);
});
it("shares filtered statistics, preserves omitted fields, and timestamps completion transitions", () => {
  const task = create("Report", {
    description: "Keep description",
    priority: 5,
    estimated_hours: 3,
    due_date: "2026-01-01",
  });
  const done = update(task.id, 1, { status: "Completed" }, "complete");
  expect(done.completed_at).toBeTruthy();
  expect(done.description).toBe("Keep description");
  expect(update(task.id, 1, { status: "Completed" }, "complete")).toEqual(done);
  expect(() => update(task.id, 1, { title: "Stale" })).toThrow(/changed elsewhere/);
  const again = update(task.id, 2, { status: "Todo" });
  expect(again.completed_at).toBeNull();
  create("Cancelled", { status: "Cancelled", due_date: "2026-01-01", estimated_hours: 7 });
  const page = personalTodoSnapshot(todoRepositoryForUser("alice"), {
    search: "report",
    priority: 5,
  });
  expect(
    executeHostedPersonalCapability("alice", "todos", {
      action: "list",
      input: { search: "report", priority: 5 },
    }),
  ).toEqual(page);
  expect(page.stats).toMatchObject({ total_tasks: 1, overdue_tasks: 1, total_estimated_hours: 3 });
  expect(personalTodoSnapshot(todoRepositoryForUser("alice")).stats.overdue_tasks).toBe(1);
  setPersonalCapability(db, "alice", "todos", false);
  expect(() => todoRepositoryForUser("alice")).toThrow();
  setPersonalCapability(db, "alice", "todos", true);
  expect(todoRepositoryForUser("alice").list()).toHaveLength(2);
});
