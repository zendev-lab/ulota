import { describe, expect, it } from "vitest";
import {
  errorToolResult,
  mergeToolResultDetails,
  normalizeToolCallArguments,
} from "./tool-dispatch.ts";
import { sparkScriptedToolCall } from "./testing/scripted-provider.ts";

describe("provider tool JSON boundaries", () => {
  it("preserves JSON details and omits optional host-only values", () => {
    expect(mergeToolResultDetails(undefined, undefined, undefined)).toBeUndefined();
    expect(
      mergeToolResultDetails({ nested: { value: 1, absent: undefined } }, undefined, undefined),
    ).toEqual({ nested: { value: 1 } });
    expect(mergeToolResultDetails([1, null], undefined, undefined)).toEqual([1, null]);
    const call = sparkScriptedToolCall("call", "read", { path: "file", absent: undefined });
    expect(call.arguments).toEqual({ path: "file" });
    expect(errorToolResult(call, "failed", { code: "failed", absent: undefined }).details).toEqual({
      code: "failed",
    });
  });

  it("retains required arguments while removing empty optional fields", () => {
    expect(
      normalizeToolCallArguments(
        {
          properties: { required: {}, optional: {} },
          required: ["required"],
        },
        { required: "", optional: " ", nested: { absent: undefined, value: true } },
      ),
    ).toEqual({ required: "", nested: { value: true } });
  });

  it("rejects unserializable result details instead of returning invalid provider messages", () => {
    expect(() => mergeToolResultDetails({ value: 1n }, undefined, undefined)).toThrow();
  });
});
