import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function selectCiScope(paths: string[]) {
  const selectorChanged = paths.includes("scripts/select-ci-scope.mts");
  return {
    benchmarks: paths.some((path) => !path.endsWith(".md") && !path.startsWith("apps/spark-docs/")),
    mutation:
      selectorChanged ||
      paths.some(
        (path) =>
          path === ".github/workflows/ci-tests.yml" ||
          path.startsWith("apps/spark-daemon/src/product/policy/") ||
          /^apps\/spark-daemon\/(stryker\.config\.json|vitest\.mutation\.config\.ts|package\.json)$/u.test(
            path,
          ) ||
          path.startsWith("packages/spark-tasks/src/") ||
          path === "packages/spark-tasks/vitest.mutation.config.ts" ||
          /^packages\/[^/]+\/(package\.json|stryker\.config\.json)$/u.test(path),
      ),
    dependencies:
      selectorChanged ||
      paths.some(
        (path) =>
          [
            ".github/workflows/ci-static-checks.yml",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
          ].includes(path) || /^(apps|packages)\/[^/]+\/package\.json$/u.test(path),
      ),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = process.env.CI_EVENT;
  const base = process.env.CI_BASE ?? "";
  const head = process.env.CI_HEAD ?? "";
  let scope = { benchmarks: true, mutation: true, dependencies: true };
  if (event === "pull_request" || event === "push") {
    if (!/^[a-f0-9]{40}$/u.test(base) || !/^[a-f0-9]{40}$/u.test(head)) {
      throw new Error("CI_BASE and CI_HEAD must be Git commit IDs");
    }
    if (base !== "0".repeat(40)) {
      const range = `${base}${event === "pull_request" ? "..." : ".."}${head}`;
      const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", range], {
        encoding: "utf8",
      });
      scope = selectCiScope(paths.split("\0").filter(Boolean));
    }
  }
  const output = Object.entries(scope)
    .map(([name, selected]) => `${name}=${selected}\n`)
    .join("");
  appendFileSync(process.env.GITHUB_OUTPUT!, output);
}
