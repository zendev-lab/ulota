import { describe, expect, it } from "vitest";

import { newRef, type ArtifactRef } from "@zendev-lab/spark-invocation";
import { TaskGraph } from "./graph.ts";
import { normalizeTaskExecutionPolicy } from "./internal.ts";

describe("Task worktree execution authorization", () => {
  it("keeps Workspace-scoped execution independent of a GitChange target", () => {
    const policy = normalizeTaskExecutionPolicy({ isolation: "workspace" });
    expect(policy.isolation).toBe("workspace");
    expect(policy.worktreeTarget).toBeUndefined();
  });

  it("preserves only explicit supported completion gates", () => {
    expect(normalizeTaskExecutionPolicy({ completionGate: "task_evidence" }).completionGate).toBe(
      "task_evidence",
    );
    expect(() =>
      normalizeTaskExecutionPolicy({ completionGate: "unsupported" as "artifact_lens" }),
    ).toThrow("completionGate is invalid");
  });

  it("rejects non-boolean exclusive-node requirements", () => {
    expect(() =>
      normalizeTaskExecutionPolicy({
        resources: { gpuCount: 0, exclusiveNode: "yes" as unknown as boolean },
      }),
    ).toThrow("resources.exclusiveNode must be a boolean");
  });

  it("defaults imported resource requests without a GPU count to zero", () => {
    expect(
      normalizeTaskExecutionPolicy({
        resources: { minGpuMemoryGiB: 24 } as { gpuCount: number; minGpuMemoryGiB: number },
      }).resources,
    ).toEqual({ gpuCount: 0, minGpuMemoryGiB: 24 });
  });

  it("requires the primary target to be writable and deduplicates the exact set", () => {
    expect(
      normalizeTaskExecutionPolicy({
        worktreeTarget: {
          primaryArtifactRef: "artifact:primary" as ArtifactRef,
          writableArtifactRefs: [
            "artifact:primary" as ArtifactRef,
            "artifact:secondary" as ArtifactRef,
            "artifact:secondary" as ArtifactRef,
          ],
        },
      }).worktreeTarget,
    ).toEqual({
      primaryArtifactRef: "artifact:primary",
      writableArtifactRefs: ["artifact:primary", "artifact:secondary"],
    });

    expect(() =>
      normalizeTaskExecutionPolicy({
        worktreeTarget: {
          primaryArtifactRef: "artifact:primary" as ArtifactRef,
          writableArtifactRefs: ["artifact:secondary" as ArtifactRef],
        },
      }),
    ).toThrow("primaryArtifactRef must be writable");
  });

  it.each(["create", "recover"])("%s rejects authorization refs not linked to the Task", (mode) => {
    const graph = new TaskGraph();
    const project = graph.createProject({ title: "Fleet", description: "Fleet policy" });
    const input = {
      projectRef: project.ref,
      title: "Implement",
      description: "Implement the change",
      artifactRefs: ["artifact:primary" as ArtifactRef],
      executionPolicy: normalizeTaskExecutionPolicy({
        worktreeTarget: {
          primaryArtifactRef: "artifact:primary" as ArtifactRef,
          writableArtifactRefs: [
            "artifact:primary" as ArtifactRef,
            "artifact:unlinked" as ArtifactRef,
          ],
        },
      }),
    };
    const before = structuredClone(graph.snapshot());
    expect(() =>
      mode === "create" ? graph.createTask(input) : graph.ensureTask(newRef("task"), input),
    ).toThrow("artifact:unlinked must be linked in artifactRefs");
    expect(graph.snapshot()).toEqual(before);
  });
});
