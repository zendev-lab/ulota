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

export const personalCapabilitySettingSchema = z
  .object({ capability: personalCapabilitySchema, enabled: z.boolean() })
  .strict();
export const personalSessionGrantSchema = z
  .object({
    bindingId: z.string().min(1),
    sessionId: z.string().min(1),
    operationId: z.string().min(1).max(256).optional(),
    capability: personalCapabilitySchema,
    canWrite: z.boolean(),
  })
  .strict();
export const personalExecuteRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    operationId: z.string().min(1).max(256).optional(),
    capability: personalCapabilitySchema,
    action: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export const personalOperationResultSchema = z.object({ result: z.unknown() }).strict();
export const personalDeviceAccessSchema = z
  .object({ capabilities: z.array(personalCapabilitySchema) })
  .strict();

export const personalServerUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
}, "Personal Hub requires HTTPS or loopback HTTP.");
export const personalStoredCredentialSchema = personalBoundCredentialSchema.extend({
  serverUrl: personalServerUrlSchema,
});

export const personalWebOperationSchema = z
  .object({
    action: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
    operationId: z.string().min(1).max(256).optional(),
  })
  .strict();
