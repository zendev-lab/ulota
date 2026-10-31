import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createPersonalTestDatabase } from "./test-support/personal-fixture.ts";
import { setPersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import { personalSubscriptionSchema } from "@zendev-lab/spark-protocol";
const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./db.ts", () => ({ getDatabase: () => state.db }));
import {
  executeHostedPersonalCapability,
  subscriptionRepositoryForUser,
} from "./personal-catalog.ts";
import { subscriptionSnapshot } from "@zendev-lab/ulota-subscriptions";
let db: ReturnType<typeof createPersonalTestDatabase>;
beforeEach(() => {
  db = createPersonalTestDatabase(["subscriptions"]);
  state.db = db;
});

afterEach(() => db.close());
function call(
  action: string,
  input: Record<string, unknown>,
  operationId: string = crypto.randomUUID(),
) {
  return executeHostedPersonalCapability("alice", "subscriptions", { action, input, operationId });
}
it("uses one hosted service for renewal, cancellation, snapshots and owner isolation", () => {
  const original = personalSubscriptionSchema.parse(
    call("create", {
      name: "Cloud",
      price: 12,
      currency: "USD",
      start_date: "2024-01-31",
      notes: "Keep",
      auto_renew: true,
    }),
  );
  expect(original.next_payment_date).toBe("2024-02-29");
  expect(subscriptionRepositoryForUser("bob").list()).toEqual([]);
  const renewed = personalSubscriptionSchema.parse(
    call("renew", { id: original.id, expectedRevision: 1 }, "renew-once"),
  );
  expect(renewed.next_payment_date).toBe("2024-03-29");
  expect(renewed.auto_renew).toBe(true);
  expect(renewed.notes).toBe("Keep");
  expect(call("renew", { id: original.id, expectedRevision: 1 }, "renew-once")).toEqual(renewed);
  expect(() => call("renew", { id: original.id, expectedRevision: 1 })).toThrow(
    /changed elsewhere/,
  );
  const cancelled = personalSubscriptionSchema.parse(
    call("cancel", { id: original.id, expectedRevision: 2 }),
  );
  expect(cancelled.status).toBe("Cancelled");
  expect(cancelled.auto_renew).toBe(false);
  const renamed = personalSubscriptionSchema.parse(
    call("update", { id: original.id, expectedRevision: 3, patch: { name: "Renamed" } }),
  );
  expect(renamed.auto_renew).toBe(false);
  expect(renamed.status).toBe("Cancelled");
  const filters = { currency: "USD", status: "Cancelled" };
  expect(call("list", filters)).toEqual(
    subscriptionSnapshot(subscriptionRepositoryForUser("alice"), filters),
  );
  setPersonalCapability(db, "alice", "subscriptions", false);
  expect(() => call("list", {})).toThrow();
  setPersonalCapability(db, "alice", "subscriptions", true);
  expect(subscriptionRepositoryForUser("alice").list()).toHaveLength(1);
  call("delete", { id: original.id, expectedRevision: 4 });
  expect(subscriptionRepositoryForUser("alice").list()).toHaveLength(0);
});
it("rejects lifetime renewals and preserves explicit null dates and false renewal", () => {
  const lifetime = personalSubscriptionSchema.parse(
    call("create", {
      name: "Lifetime",
      price: 100,
      start_date: "2026-01-01",
      billing_cycle: "Lifetime",
    }),
  );
  expect(lifetime.next_payment_date).toBeNull();
  expect(() => call("renew", { id: lifetime.id, expectedRevision: 1 })).toThrow(/do not renew/);
  const changed = personalSubscriptionSchema.parse(
    call("update", {
      id: lifetime.id,
      expectedRevision: 1,
      patch: { auto_renew: false, next_payment_date: null, notes: "" },
    }),
  );
  expect(changed.auto_renew).toBe(false);
  expect(changed.next_payment_date).toBeNull();
});
