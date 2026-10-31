import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./db.ts", () => ({ getDatabase: () => ({}) }));
vi.mock("@zendev-lab/spark-hub-coordination/personal", () => ({
  personalSessionOwner: (_db: unknown, id: string) => (id === "private" ? "alice" : undefined),
}));
vi.mock("@zendev-lab/spark-hub-coordination/runtime-session-control", () => ({
  runRuntimeSessionControlCommand: (_db: unknown, input: unknown) => state.run(input),
  runtimeSessionRouteForRuntime: (runtimeId: string) => ({ runtimeId, scope: "daemon" }),
  runtimeSessionRouteForWorkspace: () => ({ runtimeId: "device" }),
}));
import { loadInvocationDiagnosticsForHub } from "./invocation-diagnostics.ts";
const now = new Date().toISOString();
const invocation = (sessionId: string, id: string) => ({
  invocationId: id,
  attemptCount: 1,
  retryable: false,
  sessionId,
  status: "succeeded",
  eventCursor: 0,
  createdAt: now,
  updatedAt: now,
});
it("excludes private invocations from global diagnostics and blocks their event stream", async () => {
  state.run.mockImplementation(async (input) => {
    const kind = input.payload.kind;
    if (kind === "daemon.status.request")
      return {
        invocations: { queued: 0, running: 0, succeeded: 2, failed: 0, cancelled: 0 },
        invocationHealth: {},
        observedAt: now,
      };
    if (kind === "invocation.list.request")
      return {
        invocations: [invocation("private", "inv_private"), invocation("public", "inv_public")],
        total: 2,
        observedAt: now,
        limit: 50,
        offset: 0,
      };
    if (kind === "turn.status.request")
      return {
        invocationId: "inv_private",
        sessionId: "private",
        status: "succeeded",
        eventCursor: 0,
        createdAt: now,
        updatedAt: now,
      };
    throw new Error("Private stream must not be requested");
  });
  const list = await loadInvocationDiagnosticsForHub({ workspaceId: "workspace" });
  expect(list.available).toBe(true);
  expect(list.list.invocations.map((row) => row.sessionId)).toEqual(["public"]);
  const privateSelection = await loadInvocationDiagnosticsForHub({
    workspaceId: "workspace",
    invocationId: "inv_private",
  });
  expect(privateSelection.available).toBe(false);
  expect(privateSelection.selected).toBeNull();
  expect(
    state.run.mock.calls.some(([input]) => input.payload.kind === "turn.stream.subscribe"),
  ).toBe(false);
});
