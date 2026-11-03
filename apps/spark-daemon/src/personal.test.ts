import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolveSparkPaths } from "@zendev-lab/spark-platform-node";
import { writeSparkDaemonConfig } from "./config.ts";
import { upsertSparkDaemonServerProfile } from "./server-profiles.ts";
import {
  bindPersonalHub,
  readPersonalCredential,
  requestPersonalHub,
  unbindPersonalHub,
} from "./personal.ts";
it("keeps personal credentials private, validates identity and never queues or retries offline writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "personal-device-"));
  const paths = resolveSparkPaths({ app: "daemon", sparkHome: root });
  writeSparkDaemonConfig(paths, {
    installationId: "install",
    localOwnerId: "owner",
    displayName: "Device",
  });
  await upsertSparkDaemonServerProfile(paths, {
    serverUrl: "https://hub.example",
    runtimeId: "device",
    runtimeToken: "runtime-secret",
  });
  const bound = {
    id: "binding",
    hubInstanceId: "hub-instance",
    userId: "alice",
    runtimeId: "device",
    localOwnerId: "owner",
    token: "personal-secret",
  };
  try {
    await expect(
      bindPersonalHub(paths, "http://evil.example", "pair", async () => Response.json(bound)),
    ).rejects.toThrow();
    await bindPersonalHub(paths, "https://hub.example", "pair", async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        token: "pair",
        localOwnerId: "owner",
        runtimeId: "device",
        runtimeToken: "runtime-secret",
      });
      expect(init?.redirect).toBe("error");
      return Response.json(bound);
    });
    expect(readPersonalCredential(paths)).toMatchObject(bound);
    expect(statSync(join(paths.dataDir, "personal-binding.json")).mode & 0o777).toBe(0o600);
    let attempts = 0;
    await expect(
      requestPersonalHub(paths, "session", "inventory", "create", {}, undefined, async () => {
        attempts++;
        throw new Error("offline");
      }),
    ).rejects.toThrow(/No offline write/u);
    expect(attempts).toBe(1);
    await expect(
      bindPersonalHub(paths, "https://hub.example", "pair", async () => Response.json(bound)),
    ).rejects.toThrow(/Unbind/u);
    await expect(
      unbindPersonalHub(paths, async () => new Response(null, { status: 401 })),
    ).rejects.toThrow();
    expect(readPersonalCredential(paths)).toBeDefined();
    await unbindPersonalHub(paths, async () => Response.json({ revoked: true }));
    expect(readPersonalCredential(paths)).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
