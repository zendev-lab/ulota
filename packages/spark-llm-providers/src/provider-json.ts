import type { JsonObject, JsonValue, ToolCall } from "@earendil-works/pi-ai";
import { sparkJsonObjectSchema, sparkJsonValueSchema } from "@zendev-lab/spark-protocol";

/** Convert host values at the provider boundary using JSON wire semantics. */
export function normalizeProviderJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Provider value has no JSON representation");
  return sparkJsonValueSchema.parse(JSON.parse(serialized));
}

/** Tool arguments must remain objects after serialization (including toJSON). */
export function normalizeProviderJsonObject(value: unknown): JsonObject {
  return sparkJsonObjectSchema.parse(normalizeProviderJsonValue(value));
}

/** Keep malformed calls invalid when crossing the DSH JSON-text boundary. */
export function serializeProviderToolCallArguments(
  toolCall: Pick<ToolCall, "arguments" | "argumentsError">,
): string {
  return JSON.stringify(toolCall.argumentsError ?? toolCall.arguments);
}
