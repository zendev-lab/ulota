import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { execFileSync } from "node:child_process";
import { typescriptWithSvelteImports } from "./src/svelte-preprocess.js";

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const buildVersion =
  process.env.SPARK_BUILD_GIT_SHA?.trim() ||
  execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: [typescriptWithSvelteImports, vitePreprocess()],
      adapter: adapter({ out: "build" }),
      version: { name: buildVersion },
    }),
  ],
  optimizeDeps: {
    exclude: ["@lucide/svelte", "bits-ui", "svelte-streamdown"],
    include: [
      "@zendev-lab/spark-ui > bits-ui > svelte-toolbelt > style-to-object",
      "@zendev-lab/spark-ui > svelte-streamdown > mermaid",
    ],
  },
  resolve: {
    dedupe: ["svelte"],
  },
  ssr: {
    noExternal: ["@zendev-lab/spark-ui", "@lucide/svelte", "bits-ui", "svelte-streamdown"],
  },
});
