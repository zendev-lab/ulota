import { describe, expect, it } from "vitest";
import { normalizeProviderJsonObject, normalizeProviderJsonValue } from "./provider-json.ts";

describe("provider JSON boundary", () => {
  it("preserves nested JSON and normalizes optional fields using wire semantics", () => {
    expect(
      normalizeProviderJsonObject({
        nested: { present: true, absent: undefined },
        values: [null, undefined, 42, "text"],
        date: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toEqual({
      nested: { present: true },
      values: [null, null, 42, "text"],
      date: "2026-01-01T00:00:00.000Z",
    });
    expect(normalizeProviderJsonValue(null)).toBeNull();
  });

  it("rejects values without a JSON representation", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [undefined, () => 1, 1n, cyclic]) {
      expect(() => normalizeProviderJsonValue(value)).toThrow();
    }
  });

  it("requires tool arguments to serialize to an object", () => {
    for (const value of [null, [], "text", { toJSON: () => [] }]) {
      expect(() => normalizeProviderJsonObject(value)).toThrow();
    }
  });
});
