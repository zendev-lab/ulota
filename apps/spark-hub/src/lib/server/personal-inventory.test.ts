import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { setPersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import { inventoryItemSchema } from "@zendev-lab/spark-protocol";
const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./db.ts", () => ({ getDatabase: () => state.db }));
import { executeHostedPersonalCapability, inventoryRepositoryForUser } from "./personal-catalog.ts";
import { inventorySnapshot } from "@zendev-lab/ulota-inventory";
let db: ReturnType<typeof openMemoryDatabase>;
const input = { name: "Camera", purchase_date: "2026-10-01", purchase_price: 600, tags: ["Photo"] };
beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db);
  state.db = db;
  const now = new Date().toISOString();
  for (const userId of ["alice", "bob"]) {
    db.prepare(
      "INSERT INTO users (id, display_name, role, status, created_at, updated_at) VALUES (?, ?, 'owner', 'active', ?, ?)",
    ).run(userId, userId, now, now);
    setPersonalCapability(db, userId, "inventory", true);
  }
});
afterEach(() => db.close());
it("shares one inventory snapshot across surfaces and isolates even another Hub owner", () => {
  const created = inventoryItemSchema.parse(
    executeHostedPersonalCapability("alice", "inventory", {
      action: "create",
      input,
      operationId: "create-camera",
    }),
  );
  expect(inventorySnapshot(inventoryRepositoryForUser("bob")).items).toEqual([]);
  const page = inventorySnapshot(inventoryRepositoryForUser("alice"), {
    searchQuery: "camera",
    selectedStatus: "Active",
    selectedTag: "Photo",
  });
  const agent = executeHostedPersonalCapability("alice", "inventory", {
    action: "list",
    input: { searchQuery: "camera", selectedStatus: "Active", selectedTag: "Photo" },
  });
  expect(agent).toEqual(page);
  expect(page.stats).toMatchObject({
    total_items: 1,
    total_purchase_cost: 600,
    current_asset_value: 600,
  });
  expect(() =>
    executeHostedPersonalCapability("bob", "inventory", {
      action: "get",
      input: { id: created.id },
    }),
  ).toThrow();
  expect(() =>
    executeHostedPersonalCapability("alice", "inventory", {
      action: "create",
      input: { ...input, userId: "bob" },
      operationId: "spoof",
    }),
  ).toThrow();
});
it("preserves omitted tags, accepts explicit clearing, and rejects stale edits and deletion", () => {
  const created = inventoryItemSchema.parse(
    executeHostedPersonalCapability("alice", "inventory", {
      action: "create",
      input,
      operationId: "create",
    }),
  );
  const updated = inventoryItemSchema.parse(
    executeHostedPersonalCapability("alice", "inventory", {
      action: "update",
      input: { id: created.id, expectedRevision: 1, patch: { name: "Camera II" } },
      operationId: "rename",
    }),
  );
  expect(updated.tags).toEqual(["Photo"]);
  expect(updated.status).toBe("Active");
  expect(updated.revision).toBe(2);
  expect(() =>
    executeHostedPersonalCapability("alice", "inventory", {
      action: "update",
      input: { id: created.id, expectedRevision: 1, patch: { tags: [] } },
      operationId: "stale-edit",
    }),
  ).toThrow(/changed elsewhere/u);
  expect(() =>
    executeHostedPersonalCapability("alice", "inventory", {
      action: "delete",
      input: { id: created.id, expectedRevision: 1 },
      operationId: "stale-delete",
    }),
  ).toThrow();
  const cleared = inventoryItemSchema.parse(
    executeHostedPersonalCapability("alice", "inventory", {
      action: "update",
      input: { id: created.id, expectedRevision: 2, patch: { tags: [] } },
      operationId: "clear",
    }),
  );
  expect(cleared.tags).toEqual([]);
  expect(cleared.revision).toBe(3);
  executeHostedPersonalCapability("alice", "inventory", {
    action: "delete",
    input: { id: created.id, expectedRevision: 3 },
    operationId: "delete",
  });
  expect(inventorySnapshot(inventoryRepositoryForUser("alice")).items).toEqual([]);
});
it("commits receipts with mutations and rolls failures back without losing current data", () => {
  const request = { action: "create", input, operationId: "once" };
  const first = executeHostedPersonalCapability("alice", "inventory", request);
  expect(executeHostedPersonalCapability("alice", "inventory", request)).toEqual(first);
  expect(inventorySnapshot(inventoryRepositoryForUser("alice")).items).toHaveLength(1);
  expect(() =>
    executeHostedPersonalCapability("alice", "inventory", {
      ...request,
      input: { ...input, name: "Changed" },
    }),
  ).toThrow();
  db.exec(
    `CREATE TRIGGER reject_personal_receipt BEFORE INSERT ON personal_operation_receipts BEGIN SELECT RAISE(ABORT, 'receipt unavailable'); END`,
  );
  expect(() =>
    executeHostedPersonalCapability("alice", "inventory", { ...request, operationId: "failure" }),
  ).toThrow(/receipt unavailable/u);
  expect(inventorySnapshot(inventoryRepositoryForUser("alice")).items).toHaveLength(1);
  setPersonalCapability(db, "alice", "inventory", false);
  expect(() =>
    executeHostedPersonalCapability("alice", "inventory", { action: "list", input: {} }),
  ).toThrow();
  setPersonalCapability(db, "alice", "inventory", true);
  expect(inventorySnapshot(inventoryRepositoryForUser("alice")).items).toHaveLength(1);
});
it("replays the same inventory form without changing its patch after tags are saved", async () => {
  const { createOwnerSession } = await import("./auth.ts");
  const { actions } = await import("../../routes/personal/inventory/+page.server.ts");
  db.prepare("UPDATE users SET role = 'member'").run();
  const owner = createOwnerSession(db, "Owner", null);
  setPersonalCapability(db, owner.userId, "inventory", true);
  const created = inventoryItemSchema.parse(
    executeHostedPersonalCapability(owner.userId, "inventory", {
      action: "create",
      input: { ...input, tags: ["one\ntwo"] },
      operationId: "first",
    }),
  );
  const values = {
    id: created.id,
    expectedRevision: "1",
    name: created.name,
    status: created.status,
    purchase_date: created.purchase_date,
    purchase_price: "600",
    notes: "",
    expected_years: "",
    sale_price: "0",
    sale_date: "",
    tags: "Travel",
    originalTagsText: "one\ntwo",
    operationId: "form-tags",
  };
  const event = () => ({
    locals: { sessionToken: owner.sessionToken },
    request: new Request("http://localhost/personal/inventory?/save", {
      method: "POST",
      body: new URLSearchParams(values),
    }),
  });
  expect(await actions.save!(event() as never)).toEqual({ saved: true });
  expect(await actions.save!(event() as never)).toEqual({ saved: true });
  expect(inventoryRepositoryForUser(owner.userId).get(created.id)?.tags).toEqual(["Travel"]);
  const unchanged = {
    ...values,
    expectedRevision: "2",
    operationId: "keep-tags",
    tags: "Travel",
    originalTagsText: "Travel",
    name: "Renamed",
  };
  expect(
    await actions.save!({
      ...event(),
      request: new Request("http://localhost/personal/inventory?/save", {
        method: "POST",
        body: new URLSearchParams(unchanged),
      }),
    } as never),
  ).toEqual({ saved: true });
  expect(inventoryRepositoryForUser(owner.userId).get(created.id)?.tags).toEqual(["Travel"]);
});
it("requires a bound, granted session at the actual device execution route", async () => {
  const { createPersonalBinding, redeemPersonalBinding } =
    await import("@zendev-lab/spark-hub-coordination/personal");
  const { createHash } = await import("node:crypto");
  const { POST } = await import("../../routes/api/v1/personal/device/execute/+server.ts");
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO runtime_connections (id,name,status,created_at,updated_at) VALUES ('device','Laptop','online',?,?)",
  ).run(now, now);
  db.prepare(
    "INSERT INTO daemon_credentials (id,runtime_id,kind,token_hash,scopes_json,created_at) VALUES ('credential','device','access',?,'[\"runtime:connect\"]',?)",
  ).run(createHash("sha256").update("runtime-token").digest("hex"), now);
  db.prepare(
    "INSERT INTO user_daemon_grants (user_id,runtime_id,granted_by_user_id,created_at) VALUES ('alice','device','alice',?)",
  ).run(now);
  const pairing = createPersonalBinding(db, {
    userId: "alice",
    runtimeId: "device",
    hubInstanceId: "hub",
  });
  const binding = redeemPersonalBinding(db, pairing.token, "local", "device", "runtime-token");
  const call = (
    token: string,
    sessionId = "work",
    action = "list",
    body: Record<string, unknown> = {},
  ) =>
    POST({
      request: new Request("http://localhost/api/v1/personal/device/execute", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          capability: "inventory",
          action,
          input: body,
          operationId: "device-call",
        }),
      }),
    } as never);
  await expect(call("runtime-token")).rejects.toMatchObject({ status: 401 });
  await expect(call(binding.token)).rejects.toMatchObject({ status: 403 });
  db.prepare(
    "INSERT INTO personal_session_grants (user_id,binding_id,session_id,capability,can_write) VALUES ('alice',?,'work','inventory',0)",
  ).run(binding.id);
  expect((await call(binding.token)).status).toBe(200);
  await expect(call(binding.token, "work", "create", input)).rejects.toMatchObject({ status: 403 });
  db.prepare("UPDATE personal_session_grants SET can_write=1").run();
  expect((await call(binding.token, "work", "create", input)).status).toBe(200);
  expect(inventoryRepositoryForUser("bob").list()).toHaveLength(0);
  setPersonalCapability(db, "alice", "inventory", false);
  await expect(call(binding.token)).rejects.toMatchObject({ status: 403 });
});
it("maps disabled capabilities and malformed page filters to recoverable HTTP errors", async () => {
  const { createOwnerSession } = await import("./auth.ts");
  const { load } = await import("../../routes/personal/inventory/+page.server.ts");
  db.prepare("UPDATE users SET role = 'member'").run();
  const owner = createOwnerSession(db, "Owner", null);
  const event = (query = "") => ({
    locals: { sessionToken: owner.sessionToken },
    url: new URL(`http://localhost/personal/inventory${query}`),
  });
  expect(() => load(event() as never)).toThrow(expect.objectContaining({ status: 403 }));
  setPersonalCapability(db, owner.userId, "inventory", true);
  expect(() => load(event("?status=invalid") as never)).toThrow(
    expect.objectContaining({ status: 400 }),
  );
});
it("rechecks browser authorization after reading an asynchronous request body", async () => {
  const { createOwnerSession } = await import("./auth.ts");
  const { POST } = await import("../../routes/api/v1/personal/[capability]/+server.ts");
  const { actions } = await import("../../routes/personal/inventory/+page.server.ts");
  db.prepare("UPDATE users SET role='member'").run();
  const owner = createOwnerSession(db, "Owner", null);
  setPersonalCapability(db, owner.userId, "inventory", true);
  const revoke = () =>
    db
      .prepare("UPDATE sessions SET revoked_at=? WHERE id=?")
      .run(new Date().toISOString(), owner.sessionId);
  await expect(
    POST({
      locals: { sessionToken: owner.sessionToken },
      params: { capability: "inventory" },
      request: {
        json: async () => {
          revoke();
          return { action: "create", input, operationId: "late-api" };
        },
      },
    } as never),
  ).rejects.toMatchObject({ status: 401 });
  db.prepare("UPDATE sessions SET revoked_at=NULL WHERE id=?").run(owner.sessionId);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Late",
    status: "Active",
    purchase_date: "2026-01-01",
    purchase_price: "1",
    operationId: "late-form",
  }))
    form.set(key, value);
  await expect(
    actions.save!({
      locals: { sessionToken: owner.sessionToken },
      request: {
        formData: async () => {
          revoke();
          return form;
        },
      },
    } as never),
  ).rejects.toMatchObject({ status: 401 });
  expect(inventoryRepositoryForUser(owner.userId).list()).toHaveLength(0);
});
