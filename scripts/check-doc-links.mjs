import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const result = spawnSync(
  "lychee", // NOSONAR S4036: the developer's prek environment owns PATH; no privilege boundary.
  [
    "--offline",
    "--scheme",
    "file",
    "--root-dir",
    resolve("apps/spark-docs/src/content/docs"),
    "--fallback-extensions",
    "md,mdx",
    "--index-files",
    "index.md,README.md,.",
    // Lychee treats the version suffix as an extension instead of trying .md.
    "--remap",
    String.raw`^(file:.*/guides/migration-0\.2)/?$ $1.md`,
    "--",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
