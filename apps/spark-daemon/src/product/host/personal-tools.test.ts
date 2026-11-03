import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { resolveSparkPaths, writePrivateFile } from "@zendev-lab/spark-platform-node";
import { SparkHostRuntime } from "./runtime.ts";
import { registerPersonalCapabilities } from "./personal-capabilities.ts";
it("activates only granted tools and sends the host session and call id rather than a model-selected user", async () => {
  const root = mkdtempSync(join(tmpdir(), "ulota-personal-tool-"));
  const paths = resolveSparkPaths({ app: "daemon", sparkHome: root });
  writePrivateFile(
    join(paths.dataDir, "personal-binding.json"),
    JSON.stringify({
      id: "binding",
      hubInstanceId: "hub",
      userId: "alice",
      runtimeId: "device",
      localOwnerId: "owner",
      token: "secret",
      serverUrl: "https://hub.example",
    }),
  );
  const host = new SparkHostRuntime({ cwd: root });
  registerPersonalCapabilities(host, root);
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push({ url: String(url), body });
    return Response.json(
      String(url).endsWith("/access") ? { capabilities: ["inventory"] } : { result: { items: [] } },
    );
  });
  try {
    expect(host.getActiveTools()).not.toContain("inventory");
    host.setSessionId("trusted-session");
    await host.emit("before_agent_start", {});
    expect(host.getActiveTools()).toContain("inventory");
    const tool = host.listTools().find((entry) => entry.config.name === "inventory")!.config;
    expect((tool.parameters as { type: string }).type).toBe("object");
    const result = await tool.execute(
      "call-one",
      { action: "list", input: {} },
      new AbortController().signal,
      () => {},
      { cwd: root, sessionId: "trusted-session" },
    );
    expect(result.details).toEqual({ result: { items: [] } });
    expect(requests.at(-1)?.body).toEqual({
      sessionId: "trusted-session",
      capability: "inventory",
      action: "list",
      input: {},
      operationId: JSON.stringify(["trusted-session", "inventory", "call-one"]),
    });
    await tool.execute(
      "call-one",
      { action: "list", input: {} },
      new AbortController().signal,
      () => {},
      { cwd: root, sessionId: "other-session" },
    );
    expect(requests.at(-1)?.body.operationId).not.toBe(
      JSON.stringify(["trusted-session", "inventory", "call-one"]),
    );
    expect(host.getActiveTools()).not.toContain("personal_todo");
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json(
        String(url).endsWith("/access") ? { capabilities: ["todos"] } : { result: { items: [] } },
      );
    });
    await host.emit("before_agent_start", {});
    expect(host.getActiveTools()).toContain("personal_todo");
    expect(host.getActiveTools()).not.toContain("inventory");
    const todo = host.listTools().find((entry) => entry.config.name === "personal_todo")!.config;
    await todo.execute(
      "todo-call",
      { action: "list", input: {} },
      new AbortController().signal,
      () => {},
      { cwd: root, sessionId: "trusted-session" },
    );
    expect(requests.at(-1)?.body.capability).toBe("todos");
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json(
        String(url).endsWith("/access")
          ? { capabilities: ["subscriptions"] }
          : { result: { items: [] } },
      );
    });
    await host.emit("before_agent_start", {});
    expect(host.getActiveTools()).toContain("subscription");
    expect(host.getActiveTools()).not.toContain("personal_todo");
    const subscription = host
      .listTools()
      .find((entry) => entry.config.name === "subscription")!.config;
    await subscription.execute(
      "subscription-call",
      { action: "list", input: {} },
      new AbortController().signal,
      () => {},
      { cwd: root, sessionId: "trusted-session" },
    );
    expect(requests.at(-1)?.body.capability).toBe("subscriptions");
    const attempts = requests.length;
    await expect(
      tool.execute(
        "call-two",
        { action: "list", input: {} },
        new AbortController().signal,
        () => {},
        { cwd: root, sessionId: "channel", sessionSurface: "channel" },
      ),
    ).rejects.toThrow();
    expect(requests).toHaveLength(attempts);
    vi.stubGlobal("fetch", async () => Response.json({ capabilities: [] }));
    await host.emit("before_agent_start", {});
    expect(host.getActiveTools()).not.toContain("inventory");
    expect(host.getActiveTools()).not.toContain("personal_todo");
    expect(host.getActiveTools()).not.toContain("subscription");
  } finally {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  }
});
