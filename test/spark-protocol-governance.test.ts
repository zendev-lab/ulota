import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  SPARK_PROTOCOL_SUBPATHS,
  findSparkProtocolRootReferences,
  isSparkProductionSourcePath,
  sparkProtocolSubpathBoundaryViolations,
} from "../scripts/spark-protocol-governance.mjs";

describe("protocol import governance", () => {
  test("publishes the contract-domain entry points", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../packages/spark-protocol/package.json", import.meta.url), "utf8"),
    ) as { exports: Record<string, string> };
    for (const subpath of SPARK_PROTOCOL_SUBPATHS) {
      expect(manifest.exports[`./${subpath}`]).toBe(`./src/${subpath}.ts`);
    }
  });

  test.each([
    'import { createId } from "@zendev-lab/spark-protocol";',
    'export { createId } from "@zendev-lab/spark-protocol";',
    'import "@zendev-lab/spark-protocol";',
    'const protocol = import("@zendev-lab/spark-protocol");',
    'type Protocol = import("@zendev-lab/spark-protocol").SparkJsonValue;',
    'const protocol = require("@zendev-lab/spark-protocol");',
    'import protocol = require("@zendev-lab/spark-protocol");',
  ])("finds root references in %s", (source) => {
    expect(findSparkProtocolRootReferences(source)).toHaveLength(1);
  });

  test("reads Svelte scripts without treating markup as an import", () => {
    const source = `<script lang="ts">import { createId } from "@zendev-lab/spark-protocol";</script>
      <p>import "@zendev-lab/spark-protocol";</p>`;
    expect(findSparkProtocolRootReferences(source, "view.svelte")).toHaveLength(1);
  });

  test("allows subpaths and ignores comments and ordinary strings", () => {
    const source = `import { createId } from "@zendev-lab/spark-protocol/domain";
      // import "@zendev-lab/spark-protocol";
      const example = 'require("@zendev-lab/spark-protocol")';`;
    expect(findSparkProtocolRootReferences(source)).toEqual([]);
  });

  test.each([
    ["domain", 'export * from "./presentation.ts";'],
    ["presentation", 'import type { Claim } from "./task-claim.ts";'],
    ["runtime", 'export * from "./application.ts";'],
  ])("rejects forbidden direct dependencies of %s", (subpath, source) => {
    expect(sparkProtocolSubpathBoundaryViolations(subpath, source)).toHaveLength(1);
  });

  test.each([
    ["domain", 'export * from "./refs.ts";'],
    ["presentation", 'export * from "./conversation.ts";'],
    ["runtime", 'export * from "./runtime-v1/messages.ts";'],
  ])("allows the owned dependencies of %s", (subpath, source) => {
    expect(sparkProtocolSubpathBoundaryViolations(subpath, source)).toEqual([]);
  });

  test("checks production variants and excludes test files", () => {
    for (const extension of ["mts", "cts", "jsx", "svelte", "ts"]) {
      expect(isSparkProductionSourcePath(`apps/demo/src/main.${extension}`)).toBe(true);
    }
    expect(isSparkProductionSourcePath("packages/demo/src/main.test.ts")).toBe(false);
    expect(isSparkProductionSourcePath("packages/demo/src/__tests__/main.ts")).toBe(false);
  });
});
