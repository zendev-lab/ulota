import { describe, expect, it } from "vitest";
import { selectCiScope } from "../scripts/select-ci-scope.mts";

describe("CI path selection", () => {
  it("keeps documentation-only changes out of benchmarks and focused mutation", () => {
    expect(selectCiScope(["README.md", "apps/spark-docs/astro.config.mjs"])).toEqual({
      benchmarks: false,
      mutation: false,
      dependencies: false,
    });
  });

  it("selects changed policy and task code without a dependency audit", () => {
    expect(
      selectCiScope([
        "apps/spark-daemon/src/product/policy/approve.ts",
        "packages/spark-tasks/src/task.ts",
      ]),
    ).toEqual({
      benchmarks: true,
      mutation: true,
      dependencies: false,
    });
  });

  it("selects direct workspace manifests but excludes nested fixtures", () => {
    expect(selectCiScope(["packages/example/package.json"])).toEqual({
      benchmarks: true,
      mutation: true,
      dependencies: true,
    });
    expect(selectCiScope(["packages/example/fixtures/package.json"])).toEqual({
      benchmarks: true,
      mutation: false,
      dependencies: false,
    });
  });

  it("selects only the affected workflow lane", () => {
    expect(selectCiScope([".github/workflows/ci-tests.yml"]).mutation).toBe(true);
    expect(selectCiScope([".github/workflows/ci-static-checks.yml"]).dependencies).toBe(true);
    expect(selectCiScope(["scripts/select-ci-scope.mts"])).toEqual({
      benchmarks: true,
      mutation: true,
      dependencies: true,
    });
  });
});
