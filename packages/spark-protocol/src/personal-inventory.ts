import { z } from "zod";

export const inventoryStatusSchema = z.enum(["Active", "Inactive", "Sold", "Lost", "Damaged"]);
export const inventoryItemSchema = z
  .object({
    id: z.string().min(1),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1),
    status: inventoryStatusSchema.default("Active"),
    purchase_date: z.iso.date(),
    purchase_price: z.number().nonnegative().default(0),
    notes: z.string().default(""),
    expected_years: z.number().nonnegative().nullable().default(null),
    sale_price: z.number().nonnegative().default(0),
    sale_date: z.iso.date().nullable().default(null),
    tags: z.array(z.string()).default([]),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict();
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export const inventoryItemInputSchema = inventoryItemSchema.omit({
  id: true,
  revision: true,
  created_at: true,
  updated_at: true,
});
export const inventoryItemPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    status: inventoryStatusSchema.optional(),
    purchase_date: z.iso.date().optional(),
    purchase_price: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    expected_years: z.number().nonnegative().nullable().optional(),
    sale_price: z.number().nonnegative().optional(),
    sale_date: z.iso.date().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();
export const inventoryFiltersSchema = z
  .object({
    searchQuery: z.string().default(""),
    selectedStatus: inventoryStatusSchema.nullable().default(null),
    selectedTag: z.string().nullable().default(null),
  })
  .strict();
const idInput = z.object({ id: z.string().min(1) }).strict();
const revisionInput = idInput.extend({ expectedRevision: z.number().int().positive() });
export const inventoryRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      input: inventoryFiltersSchema.default({
        searchQuery: "",
        selectedStatus: null,
        selectedTag: null,
      }),
    })
    .strict(),
  z
    .object({
      action: z.literal("stats"),
      input: inventoryFiltersSchema.default({
        searchQuery: "",
        selectedStatus: null,
        selectedTag: null,
      }),
    })
    .strict(),
  z.object({ action: z.literal("get"), input: idInput }).strict(),
  z.object({ action: z.literal("create"), input: inventoryItemInputSchema }).strict(),
  z
    .object({
      action: z.literal("update"),
      input: revisionInput.extend({ patch: inventoryItemPatchSchema }),
    })
    .strict(),
  z.object({ action: z.literal("delete"), input: revisionInput }).strict(),
]);
export interface InventoryStats {
  total_items: number;
  total_purchase_cost: number;
  current_asset_value: number;
  active_items: number;
  inactive_items: number;
  sold_items: number;
  lost_items: number;
  damaged_items: number;
  average_price: number;
  average_daily_spending: number;
  most_common_tags: { tag: string; count: number }[];
}

export const inventoryToolParametersSchema = z
  .object({
    action: z.enum(["list", "stats", "get", "create", "update", "delete"]),
    input: z.union([
      inventoryFiltersSchema,
      idInput,
      inventoryItemInputSchema,
      revisionInput.extend({ patch: inventoryItemPatchSchema }),
      revisionInput,
    ]),
  })
  .strict();
