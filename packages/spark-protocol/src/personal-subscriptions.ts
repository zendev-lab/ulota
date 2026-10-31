import { z } from "zod";
export const subscriptionStatusSchema = z.enum(["Active", "Cancelled", "Paused", "Expired"]);
export const subscriptionCurrencySchema = z.enum(["CNY", "USD", "EUR", "GBP", "JPY"]);
export const subscriptionCycleSchema = z.enum([
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Yearly",
  "Lifetime",
]);
const fields = {
  name: z.string().trim().min(1),
  logo_url: z.string().nullable(),
  price: z.number().nonnegative(),
  currency: subscriptionCurrencySchema,
  billing_cycle: subscriptionCycleSchema,
  cycle_amount: z.number().int().positive(),
  auto_renew: z.boolean(),
  start_date: z.iso.date(),
  next_payment_date: z.iso.date().nullable(),
  status: subscriptionStatusSchema,
  category: z.string(),
  website: z.string().nullable(),
  reminder_days: z.number().int().nonnegative(),
  payment_method: z.string(),
  notes: z.string(),
};
export const subscriptionPatchSchema = z.object(fields).partial().strict();
export const subscriptionInputSchema = z
  .object({
    ...fields,
    logo_url: fields.logo_url.default(null),
    currency: fields.currency.default("CNY"),
    billing_cycle: fields.billing_cycle.default("Monthly"),
    cycle_amount: fields.cycle_amount.default(1),
    auto_renew: fields.auto_renew.default(true),
    next_payment_date: fields.next_payment_date.optional(),
    status: fields.status.default("Active"),
    category: fields.category.default(""),
    website: fields.website.default(null),
    reminder_days: fields.reminder_days.default(3),
    payment_method: fields.payment_method.default(""),
    notes: fields.notes.default(""),
  })
  .strict();
export const personalSubscriptionSchema = subscriptionInputSchema.extend({
  next_payment_date: fields.next_payment_date,
  id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
export type PersonalSubscription = z.infer<typeof personalSubscriptionSchema>;
export const subscriptionFiltersSchema = z
  .object({
    search: z.string().default(""),
    status: subscriptionStatusSchema.nullable().default(null),
    category: z.string().nullable().default(null),
    currency: subscriptionCurrencySchema.nullable().default(null),
  })
  .strict();
const id = z.object({ id: z.string().min(1) }).strict();
const revision = id.extend({ expectedRevision: z.number().int().positive() });
export const subscriptionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), input: subscriptionFiltersSchema }).strict(),
  z.object({ action: z.literal("stats"), input: subscriptionFiltersSchema }).strict(),
  z.object({ action: z.literal("get"), input: id }).strict(),
  z.object({ action: z.literal("create"), input: subscriptionInputSchema }).strict(),
  z
    .object({
      action: z.literal("update"),
      input: revision.extend({ patch: subscriptionPatchSchema }),
    })
    .strict(),
  z.object({ action: z.literal("delete"), input: revision }).strict(),
  z.object({ action: z.literal("renew"), input: revision }).strict(),
  z.object({ action: z.literal("cancel"), input: revision }).strict(),
]);
export const subscriptionToolParametersSchema = z
  .object({
    action: z.enum(["list", "stats", "get", "create", "update", "delete", "renew", "cancel"]),
    input: z.union([
      subscriptionFiltersSchema,
      id,
      subscriptionInputSchema,
      revision.extend({ patch: subscriptionPatchSchema }),
      revision,
    ]),
  })
  .strict();
