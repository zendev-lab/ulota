import codspeedPlugin from "@codspeed/vitest-plugin";
import { defineConfig } from "vitest/config";

const benchmarkFiles = ["benchmarks/**/*.bench.ts"];

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    environment: "node",
    include: [],
    benchmark: {
      include: benchmarkFiles,
    },
  },
});
