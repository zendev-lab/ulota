import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it.each(["local", "fixed", "legacy", "proxy"] as const)(
  "preserves the %s Hub origin and rejects cross-origin forms",
  async (mode) => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Missing test listen address");
    const port = address.port;
    await new Promise<void>((done) => reservation.close(() => done()));
    const origin = mode === "local" ? `http://127.0.0.1:${port}` : "https://hub.example.test:8443";
    const root = await mkdtemp(join(tmpdir(), "spark-hub-origin-"));
    const child = spawn(process.execPath, ["--import", "tsx", "apps/spark-hub/server/index.ts"], {
      cwd: resolve("."),
      env: {
        ...process.env,
        SPARK_HOME: root,
        HOST: "127.0.0.1",
        PORT: String(port),
        SPARK_HUB_PUBLIC_URL: mode === "fixed" ? origin : mode === "proxy" ? "auto" : undefined,
        ORIGIN: mode === "legacy" ? origin : undefined,
        SPARK_HUB_TRUST_PROXY: mode === "local" ? undefined : "loopback",
        SPARK_HUB_PROXY_HOPS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    let diagnostics = "";
    child.stdout.on("data", (chunk) => {
      diagnostics = (diagnostics + String(chunk)).slice(-16000);
    });
    child.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + String(chunk)).slice(-16000);
    });
    const headers = {
      host: "untrusted.example.test",
      "x-forwarded-for": "127.0.0.1",
      "x-forwarded-proto": mode === "proxy" ? "https" : "http",
      "x-forwarded-host": mode === "proxy" ? "hub.example.test:8443" : "untrusted.example.test",
      "x-spark-hub-protocol": "http",
      "x-spark-hub-host": "untrusted.example.test",
    };
    const url = `http://127.0.0.1:${port}/login`;
    try {
      await expect
        .poll(
          async () => {
            if (child.exitCode !== null) throw new Error(diagnostics);
            try {
              return (await fetch(url, { headers })).status;
            } catch {
              return 0;
            }
          },
          { timeout: 15000, message: "built Hub responds to login" },
        )
        .toBe(200);
      const post = (requestOrigin: string) =>
        fetch(url, {
          method: "POST",
          redirect: "manual",
          headers: {
            ...headers,
            origin: requestOrigin,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "token=invalid-test-token",
        });
      expect((await post(origin)).status, diagnostics).toBe(401);
      expect((await post("https://attacker.example.test")).status, diagnostics).toBe(403);
    } finally {
      child.kill("SIGTERM");
      await exited;
      await rm(root, { recursive: true, force: true });
    }
  },
);
