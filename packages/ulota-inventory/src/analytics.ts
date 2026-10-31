import type {
  InventoryItem as Item,
  InventoryStats as ItemStats,
} from "@zendev-lab/spark-protocol";

const dayMilliseconds = 86_400_000;

export function localDate(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp / dayMilliseconds
    : null;
}

export function holdingDays(
  item: Pick<Item, "purchase_date" | "sale_date" | "status">,
  today = localDate(),
): number | null {
  const start = dateNumber(item.purchase_date);
  const now = dateNumber(today);
  const end = item.status === "Sold" ? dateNumber(item.sale_date ?? "") : now;
  if (start === null || end === null || now === null || start > now || end < start || end > now)
    return null;
  return Math.max(1, end - start);
}

export function calculateItemStats(items: readonly Item[], today = localDate()): ItemStats {
  const stats: ItemStats = {
    total_items: items.length,
    total_purchase_cost: 0,
    current_asset_value: 0,
    active_items: 0,
    inactive_items: 0,
    sold_items: 0,
    lost_items: 0,
    damaged_items: 0,
    average_price: 0,
    average_daily_spending: 0,
    most_common_tags: [],
  };
  const statusKeys = {
    Active: "active_items",
    Inactive: "inactive_items",
    Sold: "sold_items",
    Lost: "lost_items",
    Damaged: "damaged_items",
  } as const;
  const tags = new Map<string, number>();
  let costWithDates = 0;
  let days = 0;
  for (const item of items) {
    stats.total_purchase_cost += item.purchase_price;
    stats[statusKeys[item.status]]++;
    if (item.status === "Active" || item.status === "Inactive")
      stats.current_asset_value += item.purchase_price;
    const duration = holdingDays(item, today);
    if (duration !== null) {
      costWithDates += item.purchase_price;
      days += duration;
    }
    for (const tag of new Set(item.tags)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  stats.average_price = items.length ? stats.total_purchase_cost / items.length : 0;
  stats.average_daily_spending = days ? costWithDates / days : 0;
  stats.most_common_tags = [...tags]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
  return stats;
}

export function purchaseTrend(items: readonly Item[], today = localDate()) {
  const current = dateNumber(today);
  if (current === null) throw new Error("Invalid report date");
  const end = new Date(current * dayMilliseconds);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1))
      .toISOString()
      .slice(0, 7),
    amount: 0,
    count: 0,
  }));
  const buckets = new Map(months.map((month) => [month.month, month]));
  for (const item of items) {
    const purchase = dateNumber(item.purchase_date);
    if (purchase === null || purchase > current) continue;
    const bucket = buckets.get(item.purchase_date.slice(0, 7));
    if (bucket) {
      bucket.amount += item.purchase_price;
      bucket.count++;
    }
  }
  return months;
}

export function filterItems(
  items: readonly Item[],
  filters: { searchQuery: string; selectedStatus: string | null; selectedTag: string | null },
): Item[] {
  const query = filters.searchQuery.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (!filters.selectedStatus || item.status === filters.selectedStatus) &&
      (!filters.selectedTag || item.tags.includes(filters.selectedTag)) &&
      (!query ||
        [item.name, item.notes, ...item.tags].some((value) =>
          value.toLocaleLowerCase().includes(query),
        )),
  );
}
