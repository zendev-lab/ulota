import { describe, expect, it } from "vitest";
import { calculateItemStats, filterItems, holdingDays, purchaseTrend } from "./analytics";
import { inventoryItemSchema as itemSchema } from "@zendev-lab/spark-protocol";

const item = (overrides = {}) =>
  itemSchema.parse({
    id: "a",
    revision: 1,
    name: "Camera",
    purchase_date: "2026-10-01",
    purchase_price: 600,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  });

describe("item analytics", () => {
  it("counts calendar days without time-of-day or daylight-saving drift", () => {
    expect(holdingDays(item(), "2026-10-01")).toBe(1);
    expect(holdingDays(item(), "2026-10-03")).toBe(2);
    expect(holdingDays(item({ purchase_date: "2026-03-07" }), "2026-03-09")).toBe(2);
  });
  it("uses a sale date only for sold records and excludes invalid date ranges", () => {
    expect(holdingDays(item({ sale_date: "2026-10-02", status: "Sold" }), "2026-10-03")).toBe(1);
    expect(holdingDays(item({ sale_date: "2026-10-02" }), "2026-10-03")).toBe(2);
    expect(holdingDays(item({ status: "Sold" }), "2026-10-03")).toBeNull();
    expect(holdingDays(item({ status: "Sold", sale_date: "2026-09-30" }), "2026-10-03")).toBeNull();
    expect(holdingDays(item({ purchase_date: "2026-10-04" }), "2026-10-03")).toBeNull();
    expect(holdingDays({ ...item(), purchase_date: "2026-02-30" }, "2026-10-03")).toBeNull();
  });
  it("separates held cost from purchase history and uses matching daily-cost denominators", () => {
    const stats = calculateItemStats(
      [
        item({ tags: ["Photo", "Photo"] }),
        item({ id: "b", status: "Sold", sale_date: "2026-10-02", purchase_price: 300 }),
        item({ id: "c", purchase_date: "2026-10-04", purchase_price: 900 }),
      ],
      "2026-10-03",
    );
    expect(stats.current_asset_value).toBe(1500);
    expect(stats.total_purchase_cost).toBe(1800);
    expect(stats.average_daily_spending).toBe(300);
    expect(stats.sold_items).toBe(1);
    expect(stats.most_common_tags).toEqual([{ tag: "Photo", count: 1 }]);
    expect(calculateItemStats([], "2026-10-03").average_daily_spending).toBe(0);
  });
  it("keeps a fixed 12-month window including zeros and excludes future purchases", () => {
    const months = purchaseTrend(
      [
        item(),
        item({ purchase_date: "2026-10-04" }),
        item({ purchase_date: "2025-10-01" }),
        item({ purchase_date: "2025-11-01", purchase_price: 0 }),
      ],
      "2026-10-03",
    );
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: "2025-11", amount: 0, count: 1 });
    expect(months[11]).toEqual({ month: "2026-10", amount: 600, count: 1 });
    expect(months[4].amount).toBe(0);
  });
  it("combines trimmed case-insensitive search, tag and status filters", () => {
    const records = [
      item({ tags: ["Photo"] }),
      item({ id: "b", status: "Inactive", notes: "Camera bag", tags: ["Travel"] }),
    ];
    expect(
      filterItems(records, {
        searchQuery: " CAMERA ",
        selectedTag: "Photo",
        selectedStatus: "Active",
      }).map((record) => record.id),
    ).toEqual(["a"]);
    expect(
      filterItems(records, { searchQuery: "travel", selectedTag: null, selectedStatus: null }).map(
        (record) => record.id,
      ),
    ).toEqual(["b"]);
  });
});
