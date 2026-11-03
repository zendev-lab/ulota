import { z } from "zod";
import { inventoryItemSchema } from "./personal-inventory.ts";
import { personalTodoSchema } from "./personal-todos.ts";
import { personalSubscriptionSchema } from "./personal-subscriptions.ts";
export const personalLegacyPackageSchema = z
  .object({
    format: z.literal("ulota.personal.bonehub"),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    warnings: z.array(z.string()).default([]),
    inventory: z.array(inventoryItemSchema),
    todos: z.array(personalTodoSchema),
    subscriptions: z.array(personalSubscriptionSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const capability of ["inventory", "todos", "subscriptions"] as const) {
      const ids = new Set<string>();
      for (const [index, item] of value[capability].entries()) {
        if (ids.has(item.id))
          ctx.addIssue({
            code: "custom",
            path: [capability, index, "id"],
            message: "Duplicate legacy record id.",
          });
        ids.add(item.id);
      }
    }
  });
export type PersonalLegacyPackage = z.infer<typeof personalLegacyPackageSchema>;
