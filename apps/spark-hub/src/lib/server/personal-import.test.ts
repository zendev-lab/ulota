import { createPersonalTestDatabase } from "./test-support/personal-fixture.ts";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { personalLegacyMapping } from "@zendev-lab/spark-hub-storage-sqlite";
import { setPersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import {
  inventoryItemSchema,
  personalTodoSchema,
  personalSubscriptionSchema,
  type PersonalLegacyPackage,
} from "@zendev-lab/spark-protocol";
const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./db.ts", () => ({ getDatabase: () => state.db }));
import { previewPersonalImport, commitPersonalImport } from "./personal-import.ts";
import {
  inventoryRepositoryForUser,
  todoRepositoryForUser,
  subscriptionRepositoryForUser,
  executeHostedPersonalCapability,
} from "./personal-catalog.ts";
let db: ReturnType<typeof createPersonalTestDatabase>;
function fixture(): PersonalLegacyPackage {
  return {
    format: "ulota.personal.bonehub",
    version: 1,
    exportedAt: "2026-10-23T00:00:00.000Z",
    warnings: [],
    inventory: [
      inventoryItemSchema.parse({
        id: "legacy-item",
        revision: 1,
        name: "Camera",
        purchase_date: "2026-01-01",
        tags: ["one\ntwo"],
        created_at: "created",
        updated_at: "updated",
      }),
    ],
    todos: [
      personalTodoSchema.parse({
        id: "parent",
        revision: 1,
        title: "Parent",
        completed_at: null,
        created_at: "created",
        updated_at: "updated",
      }),
      personalTodoSchema.parse({
        id: "child",
        revision: 1,
        title: "Child",
        parent_id: "parent",
        dependencies: ["parent"],
        completed_at: null,
        created_at: "created",
        updated_at: "updated",
      }),
    ],
    subscriptions: [
      personalSubscriptionSchema.parse({
        id: "legacy-sub",
        revision: 1,
        name: "Service",
        price: 12,
        currency: "USD",
        auto_renew: false,
        start_date: "2026-01-31",
        next_payment_date: null,
        created_at: "created",
        updated_at: "updated",
      }),
    ],
  };
}
beforeEach(() => {
  db = createPersonalTestDatabase(["inventory", "todos", "subscriptions"]);
  state.db = db;
});

afterEach(() => db.close());
it("previews without writing, maps relations, and imports the same package independently per owner", () => {
  const payload = fixture();
  expect(previewPersonalImport("alice", payload).entries.map((row) => row.status)).toEqual([
    "create",
    "create",
    "create",
    "create",
  ]);
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(0);
  const first = commitPersonalImport("alice", payload, "first");
  expect(commitPersonalImport("alice", payload, "first")).toEqual(first);
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(1);
  expect(subscriptionRepositoryForUser("alice").list()[0]?.auto_renew).toBe(false);
  const tasks = todoRepositoryForUser("alice").list();
  const parent = tasks.find((item) => item.title === "Parent")!;
  const child = tasks.find((item) => item.title === "Child")!;
  expect(parent.id).not.toBe("parent");
  expect(child.parent_id).toBe(parent.id);
  expect(child.dependencies).toEqual([parent.id]);
  commitPersonalImport("bob", payload, "first");
  expect(
    todoRepositoryForUser("bob")
      .list()
      .some((item) => item.id === parent.id),
  ).toBe(false);
});
it("never overwrites later Hub edits, reports changed sources and does not resurrect deleted targets", () => {
  const payload = fixture();
  commitPersonalImport("alice", payload, "first");
  const current = inventoryRepositoryForUser("alice").list()[0]!;
  executeHostedPersonalCapability("alice", "inventory", {
    action: "update",
    input: { id: current.id, expectedRevision: 1, patch: { name: "Hub edit" } },
    operationId: "edit",
  });
  expect(
    commitPersonalImport("alice", payload, "repeat").entries.every((row) => row.status === "skip"),
  ).toBe(true);
  expect(inventoryRepositoryForUser("alice").get(current.id)?.name).toBe("Hub edit");
  payload.inventory[0]!.name = "Source edit";
  expect(
    previewPersonalImport("alice", payload).entries.find((row) => row.capability === "inventory")
      ?.status,
  ).toBe("source_changed");
  commitPersonalImport("alice", payload, "changed");
  expect(inventoryRepositoryForUser("alice").get(current.id)?.name).toBe("Hub edit");
  executeHostedPersonalCapability("alice", "inventory", {
    action: "delete",
    input: { id: current.id, expectedRevision: 2 },
    operationId: "delete",
  });
  expect(
    commitPersonalImport("alice", payload, "missing").entries.find(
      (row) => row.capability === "inventory",
    )?.status,
  ).toBe("target_missing");
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(0);
});
it("validates the complete pending graph before any write and rolls back records and mappings on receipt failure", () => {
  const cyclic = fixture();
  cyclic.todos[0]!.dependencies = ["child"];
  expect(() => commitPersonalImport("alice", cyclic, "cycle")).toThrow(/cycle/);
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(0);
  expect(personalLegacyMapping(db, "alice", "inventory", "legacy-item")).toBeUndefined();
  const payload = fixture();
  db.exec(
    "CREATE TRIGGER reject_import_receipt BEFORE INSERT ON personal_operation_receipts BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END",
  );
  expect(() => commitPersonalImport("alice", payload, "fail")).toThrow(/receipt unavailable/);
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(0);
  expect(todoRepositoryForUser("alice").list()).toHaveLength(0);
  expect(subscriptionRepositoryForUser("alice").list()).toHaveLength(0);
  expect(personalLegacyMapping(db, "alice", "inventory", "legacy-item")).toBeUndefined();
});
it("rejects unsupported versions, duplicate IDs, malformed fields, spoofed owners and disabled capabilities", () => {
  const payload = fixture();
  for (const bad of [
    { ...payload, version: 2 },
    { ...payload, userId: "bob" },
    { ...payload, inventory: [...payload.inventory, ...payload.inventory] },
    { ...payload, inventory: [{ ...payload.inventory[0], purchase_date: "invalid" }] },
  ])
    expect(() => commitPersonalImport("alice", bad, "invalid")).toThrow();
  setPersonalCapability(db, "alice", "todos", false);
  expect(() => commitPersonalImport("alice", payload, "disabled")).toThrow();
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(0);
});
it("uses the actual authenticated account for upload preview and apply", async () => {
  const { createOwnerSession } = await import("./auth.ts");
  const { actions } = await import("../../routes/personal/import/+page.server.ts");
  db.prepare("UPDATE users SET role='member'").run();
  const owner = createOwnerSession(db, "Importer", null);
  for (const capability of ["inventory", "todos", "subscriptions"] as const)
    setPersonalCapability(db, owner.userId, capability, true);
  const payload = fixture();
  const form = new FormData();
  form.set(
    "package",
    new File([JSON.stringify(payload)], "export.json", { type: "application/json" }),
  );
  const preview = await actions.preview!({
    locals: { sessionToken: owner.sessionToken },
    request: new Request("http://localhost/personal/import?/preview", {
      method: "POST",
      body: form,
    }),
  } as never);
  expect(preview).toMatchObject({ preview: { entries: expect.any(Array) } });
  expect(inventoryRepositoryForUser(owner.userId).list()).toHaveLength(0);
  const commitForm = new URLSearchParams({
    payload: JSON.stringify(payload),
    operationId: "page-import",
  });
  expect(
    await actions.commit!({
      locals: { sessionToken: owner.sessionToken },
      request: new Request("http://localhost/personal/import?/commit", {
        method: "POST",
        body: commitForm,
      }),
    } as never),
  ).toMatchObject({ imported: { entries: expect.any(Array) } });
  expect(inventoryRepositoryForUser(owner.userId).list()).toHaveLength(1);
  expect(inventoryRepositoryForUser("alice").list()).toHaveLength(0);
  await expect(
    actions.commit!({
      locals: { sessionToken: null },
      request: new Request("http://localhost/personal/import?/commit", {
        method: "POST",
        body: commitForm,
      }),
    } as never),
  ).rejects.toMatchObject({ status: 401 });
});
