import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const suites = [{ directory: root, args: ["--config", "vitest.root.config.ts"] }];

for (const group of ["apps", "packages"]) {
  for (const entry of readdirSync(resolve(root, group), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = resolve(root, group, entry.name);
    const manifest = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
    const test = manifest.scripts?.test ?? "";
    // Rust and Astro suites retain their own runners; this collects Vitest coverage.
    if (!test.startsWith("vp test run")) continue;
    const command = test.split(" && ")[0];
    const match = command.match(/^vp test run(?: --config ([\w./-]+))?$/u);
    if (!match) throw new Error(`Unsupported coverage command in ${directory}: ${command}`);
    const config = match[1];
    suites.push({ directory, args: config ? ["--config", config] : [] });
  }
}

for (const { directory, args } of suites) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "vp",
      "test",
      "run",
      ...args,
      "--coverage.enabled",
      "--coverage.provider=v8",
      "--coverage.reporter=lcov",
      "--coverage.reporter=text-summary",
      ...(directory === root
        ? [
            "--coverage.include=apps/*/src/**/*.{ts,js}",
            "--coverage.include=packages/*/src/**/*.{ts,js}",
          ]
        : ["--coverage.include=src/**/*.{ts,js}"]),
      "--coverage.exclude=**/*.test.ts",
      "--coverage.exclude=**/*.spec.ts",
      "--coverage.exclude=**/src/paraglide/**",
    ],
    { cwd: directory, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  // Each workspace emits paths relative to its own root; upload unambiguous paths.
  const report = resolve(directory, "coverage/lcov.info");
  writeFileSync(
    report,
    readFileSync(report, "utf8").replace(
      /^SF:(.+)$/gm,
      (_, source) => `SF:${relative(root, resolve(directory, source))}`,
    ),
  );
}
