import { z } from "zod";

export const personalCapabilitySchema = z.enum(["inventory", "todos", "subscriptions"]);
export type PersonalCapability = z.infer<typeof personalCapabilitySchema>;
export const personalBindingSchema = z
  .object({
    id: z.string().min(1),
    hubInstanceId: z.string().min(1),
    userId: z.string().min(1),
    runtimeId: z.string().min(1),
    localOwnerId: z.string().min(1),
  })
  .strict();
export type PersonalBinding = z.infer<typeof personalBindingSchema>;
export const personalBindRequestSchema = z
  .object({
    token: z.string().min(1).max(256),
    localOwnerId: z.string().min(1).max(256),
    runtimeId: z.string().min(1),
    runtimeToken: z.string().min(1).max(256),
  })
  .strict();
export const personalBoundCredentialSchema = personalBindingSchema.extend({
  token: z.string().min(1),
});

export const personalBindingCreateRequestSchema = z
  .object({ runtimeId: z.string().min(1).max(256) })
  .strict();
export const personalBindingRevokeRequestSchema = z
  .object({ id: z.string().min(1).max(256) })
  .strict();
