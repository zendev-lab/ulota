import { z } from "zod";
export const personalTodoStatusSchema = z.enum([
  "Todo",
  "InProgress",
  "Completed",
  "Cancelled",
  "Paused",
]);
const fields = {
  title: z.string().trim().min(1),
  description: z.string(),
  status: personalTodoStatusSchema,
  priority: z.number().int().min(1).max(5),
  parent_id: z.string().min(1).nullable(),
  dependencies: z.array(z.string().min(1)),
  due_date: z.iso.date().nullable(),
  estimated_hours: z.number().nonnegative(),
};
export const personalTodoPatchSchema = z.object(fields).partial().strict();
export const personalTodoInputSchema = z
  .object({
    ...fields,
    description: fields.description.default(""),
    status: fields.status.default("Todo"),
    priority: fields.priority.default(2),
    parent_id: fields.parent_id.default(null),
    dependencies: fields.dependencies.default([]),
    due_date: fields.due_date.default(null),
    estimated_hours: fields.estimated_hours.default(0),
  })
  .strict();
export const personalTodoSchema = personalTodoInputSchema.extend({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  completed_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
export type PersonalTodo = z.infer<typeof personalTodoSchema>;
export const personalTodoFiltersSchema = z
  .object({
    search: z.string().default(""),
    status: personalTodoStatusSchema.nullable().default(null),
    priority: z.number().int().min(1).max(5).nullable().default(null),
    parent_id: z.string().nullable().optional(),
  })
  .strict();
const id = z.object({ id: z.string().min(1) }).strict();
const revision = id.extend({ expectedRevision: z.number().int().positive() });
export const personalTodoRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), input: personalTodoFiltersSchema }).strict(),
  z.object({ action: z.literal("stats"), input: personalTodoFiltersSchema }).strict(),
  z.object({ action: z.literal("get"), input: id }).strict(),
  z.object({ action: z.literal("create"), input: personalTodoInputSchema }).strict(),
  z
    .object({
      action: z.literal("update"),
      input: revision.extend({ patch: personalTodoPatchSchema }),
    })
    .strict(),
  z.object({ action: z.literal("delete"), input: revision }).strict(),
]);
export const personalTodoToolParametersSchema = z
  .object({
    action: z.enum(["list", "stats", "get", "create", "update", "delete"]),
    input: z.union([
      personalTodoFiltersSchema,
      id,
      personalTodoInputSchema,
      revision.extend({ patch: personalTodoPatchSchema }),
      revision,
    ]),
  })
  .strict();
