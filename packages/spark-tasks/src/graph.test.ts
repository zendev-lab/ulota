import { describe, expect, it } from "vitest";

import { newRef } from "@zendev-lab/spark-invocation";
import { TaskGraph } from "./graph.ts";

describe("TaskGraph creation and recovery", () => {
  it.each(["create", "recover"])("%s validates and initializes a project", (mode) => {
    const graph = new TaskGraph();
    const input = {
      title: "  Recovery  ",
      description: "Keep the checkpoint",
      purpose: "  Resume work  ",
      kind: "  ",
      kindState: { checkpoint: 1 },
      outputLanguage: "zh" as const,
    };
    const project =
      mode === "create" ? graph.createProject(input) : graph.ensureProject(newRef("proj"), input);
    expect(project).toMatchObject({
      ...input,
      purpose: "Resume work",
      kind: "generic",
      roadmap: { title: "Recovery", status: "active", items: [] },
    });
    expect(graph.getProject(project.ref)).toEqual(project);

    const before = structuredClone(graph.snapshot());
    expect(() =>
      mode === "create"
        ? graph.createProject({ ...input, title: " " })
        : graph.ensureProject(newRef("proj"), { ...input, title: " " }),
    ).toThrow("project title is required");
    expect(graph.snapshot()).toEqual(before);
  });

  it("retains project roadmap progress on recovery and refuses conflicting identities", () => {
    const graph = new TaskGraph();
    const ref = newRef("proj");
    const input = { title: "Recovery", description: "Checkpoint", kind: "  workflow  " };
    const project = graph.ensureProject(ref, input);
    graph.replaceProjectRoadmap(ref, { ...project.roadmap, status: "done" });
    graph.updateProject(ref, { purpose: "Reviewed purpose", outputLanguage: "en" });
    const before = structuredClone(graph.snapshot());

    expect(graph.ensureProject(ref, input)).toEqual(before.projects[0]);
    for (const key of ["title", "description", "kind"]) {
      expect(() => graph.ensureProject(ref, { ...input, [key]: "Different" })).toThrow(
        "already bound to different content",
      );
    }
    expect(graph.snapshot()).toEqual(before);
  });

  it("retains recovery progress and keeps fixed names distinct from ordinary creation", () => {
    const graph = new TaskGraph();
    const project = graph.createProject({ title: "Recovery", description: "Recovery" });
    const input = {
      projectRef: project.ref,
      name: "fixed",
      title: "Checkpoint",
      description: "Resume the checkpoint",
    };
    const ref = newRef("task");
    graph.ensureTask(ref, input);
    graph.claimTask(ref, {
      kind: "main",
      claimedBy: "session:owner",
      sessionId: "owner",
      leaseMs: 60_000,
    });
    const created = graph.createTask(input);
    expect(created.name).not.toBe("fixed");

    const before = structuredClone(graph.snapshot());
    expect(graph.ensureTask(ref, input)).toMatchObject({
      status: "running",
      claim: { claimedBy: "session:owner" },
    });
    expect(() => graph.ensureTask(newRef("task"), input)).toThrow();
    expect(() => graph.ensureTask(ref, { ...input, title: "Different checkpoint" })).toThrow();
    expect(graph.snapshot()).toEqual(before);
  });

  it("keeps legacy TODO seeding specific to ordinary creation", () => {
    const graph = new TaskGraph();
    const project = graph.createProject({ title: "Import", description: "Import" });
    const input = {
      projectRef: project.ref,
      title: "Work",
      description: "Canonical plan",
      todos: [{ content: "Imported step" }],
    };
    expect(graph.createTask(input).plan?.items?.map((item) => item.title)).toEqual([
      "Imported step",
    ]);
    expect(
      graph
        .ensureTask(newRef("task"), { ...input, name: "recovered" })
        .plan?.items?.map((item) => item.title),
    ).toEqual(["Canonical plan"]);
  });
});
