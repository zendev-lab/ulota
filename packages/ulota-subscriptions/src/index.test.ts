import { expect, it } from "vitest";
import { personalSubscriptionSchema } from "@zendev-lab/spark-protocol";
import { nextPaymentDate, subscriptionSnapshot } from "./index.ts";
it("clamps calendar renewals across month ends, leap years, and multi-cycle periods", () => {
  expect(nextPaymentDate("2026-01-31", "Monthly")).toBe("2026-02-28");
  expect(nextPaymentDate("2024-01-31", "Monthly")).toBe("2024-02-29");
  expect(nextPaymentDate("2024-02-29", "Yearly")).toBe("2025-02-28");
  expect(nextPaymentDate("2026-01-31", "Quarterly")).toBe("2026-04-30");
  expect(nextPaymentDate("2026-12-31", "Daily", 2)).toBe("2027-01-02");
  expect(nextPaymentDate("2026-01-01", "Lifetime")).toBeNull();
  expect(() => nextPaymentDate("2026-01-01", "Yearly", 1e20)).toThrow(/supported calendar/);
});
it("separates currencies, excludes inactive costs, and does not count future starts as spent", () => {
  const item = (id: string, currency: string, status = "Active", start = "2026-01-01") =>
    personalSubscriptionSchema.parse({
      id,
      name: id,
      price: 30,
      currency,
      status,
      start_date: start,
      billing_cycle: "Monthly",
      next_payment_date: "2026-10-25",
      revision: 1,
      created_at: "now",
      updated_at: "now",
    });
  const records = [
    item("a", "USD"),
    item("b", "CNY"),
    item("c", "USD", "Cancelled"),
    item("future", "EUR", "Active", "2027-01-01"),
  ];
  const repository = {
    list: () => records,
    get: () => undefined,
    insert() {},
    replace() {},
    remove() {},
  };
  const snapshot = subscriptionSnapshot(repository, {}, "2026-10-23");
  expect(snapshot.stats.byCurrency.USD?.monthly_cost).toBe(30);
  expect(snapshot.stats.byCurrency.CNY?.monthly_cost).toBe(30);
  expect(snapshot.stats.byCurrency.EUR?.estimated_spent).toBe(0);
  expect(
    subscriptionSnapshot(repository, { currency: "USD", status: "Active" }, "2026-10-23").items.map(
      (item) => item.id,
    ),
  ).toEqual(["a"]);
});

it("counts category names that coincide with JavaScript prototype properties", () => {
  const records = ["constructor", "toString", "__proto__"].map((category) =>
    personalSubscriptionSchema.parse({
      id: category,
      name: category,
      category,
      price: 1,
      start_date: "2026-01-01",
      next_payment_date: null,
      revision: 1,
      created_at: "now",
      updated_at: "now",
    }),
  );
  const snapshot = subscriptionSnapshot({
    list: () => records,
    get: () => undefined,
    insert() {},
    replace() {},
    remove() {},
  });
  expect(Object.fromEntries(Object.entries(snapshot.stats.category_counts))).toEqual({
    constructor: 1,
    toString: 1,
    ["__proto__"]: 1,
  });
});
