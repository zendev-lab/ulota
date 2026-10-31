import {
  inventoryItemSchema,
  inventoryItemPatchSchema,
  inventoryRequestSchema,
  inventoryFiltersSchema,
  type InventoryItem,
} from "@zendev-lab/spark-protocol";
import { calculateItemStats, filterItems, localDate, purchaseTrend } from "./analytics.ts";
export { calculateItemStats, filterItems, holdingDays, purchaseTrend } from "./analytics.ts";

export interface InventoryRepository {
  list(): InventoryItem[];
  get(id: string): InventoryItem | undefined;
  insert(item: InventoryItem): void;
  replace(item: InventoryItem, expectedRevision: number): void;
  remove(id: string, expectedRevision: number): void;
}
export function inventorySnapshot(
  repository: InventoryRepository,
  input: unknown = {},
  today = localDate(),
) {
  const filters = inventoryFiltersSchema.parse(input);
  const items = filterItems(repository.list(), filters);
  return {
    items,
    stats: calculateItemStats(items, today),
    trend: purchaseTrend(items, today),
    filters,
  };
}
export function executeInventory(
  repository: InventoryRepository,
  input: unknown,
  now = new Date(),
) {
  const request = inventoryRequestSchema.parse(input);
  if (request.action === "list")
    return inventorySnapshot(repository, request.input, localDate(now));
  if (request.action === "stats") {
    const snapshot = inventorySnapshot(repository, request.input, localDate(now));
    return { stats: snapshot.stats, trend: snapshot.trend, filters: snapshot.filters };
  }
  if (request.action === "create") {
    const item = inventoryItemSchema.parse({
      ...request.input,
      id: globalThis.crypto.randomUUID(),
      revision: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    repository.insert(item);
    return item;
  }
  const current = repository.get(request.input.id);
  if (!current) throw Object.assign(new Error("Inventory item not found."), { code: "not_found" });
  if (request.action === "get") return current;
  if (request.action === "delete") {
    repository.remove(current.id, request.input.expectedRevision);
    return { deleted: true };
  }
  const parsed = inventoryItemPatchSchema.parse(request.input.patch);
  const patch = Object.fromEntries(
    Object.keys(request.input.patch)
      .filter((key) => request.input.patch[key as keyof typeof request.input.patch] !== undefined)
      .map((key) => [key, parsed[key as keyof typeof parsed]]),
  );
  const updated = inventoryItemSchema.parse({
    ...current,
    ...patch,
    revision: current.revision + 1,
    updated_at: now.toISOString(),
  });
  repository.replace(updated, request.input.expectedRevision);
  return updated;
}
