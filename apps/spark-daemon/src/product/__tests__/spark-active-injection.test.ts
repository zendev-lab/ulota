import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { loadSparkSessionWorkspaceState } from "@zendev-lab/spark-driver";
import { TaskGraph } from "@zendev-lab/spark-tasks";
import { injectSparkHints } from "../policy/spark-active-injection.ts";
import { analyzeSparkEntryMode } from "../policy/spark-entry.ts";
import type { SparkToolContext } from "../policy/spark-tool-registration.ts";

test("injectSparkHints leaves session state uninitialized without a task graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spark-active-input-no-graph-"));
  try {
    const ctx: SparkToolContext = {
      cwd: dir,
      sessionManager: {
        getSessionFile: () => join(dir, ".pi-sessions", "active-input.json"),
        getLeafId: () => "active-input-leaf",
      },
    };
    await injectSparkHints({ systemPrompt: "Base prompt." }, ctx);

    assert.equal(await loadSparkSessionWorkspaceState(dir, ctx), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("analyzeSparkEntryMode treats stack-trace bugfix with no tasks as planning work", () => {
  const graph = new TaskGraph();
  const project = graph.createProject({
    title: "Stack trace project",
    description: "Project for stack trace mode analysis.",
  });
  const analysis = analyzeSparkEntryMode(
    graph,
    {
      kind: "initialized",
      hasCurrentProject: true,
      unfinishedTaskCount: 0,
    },
    [
      "TypeError: factory is not a function",
      "    at Object.execute (/tmp/tool.js:12:3)",
      "这个恶性 bug 需要修复一下",
    ].join("\n"),
    project,
  );

  assert.equal(analysis.recommendation, "plan");
});

test("research, inspect, review, and audit signals resolve directly to plan", () => {
  const graph = new TaskGraph();
  const project = graph.createProject({
    title: "Merged plan project",
    description: "Project for merged plan analysis.",
  });

  for (const prompt of [
    "research the scheduler",
    "inspect this code",
    "review the API",
    "audit it",
  ]) {
    const analysis = analyzeSparkEntryMode(
      graph,
      { kind: "initialized", hasCurrentProject: true, unfinishedTaskCount: 0 },
      prompt,
      project,
    );
    assert.equal(analysis.recommendation, "plan", prompt);
  }
});
