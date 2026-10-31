import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { defaultDatabasePath, migrate, openDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { setPersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import { createOwnerSession, sessionCookieName } from "../src/lib/server/auth.ts";
const root = await mkdtemp(join(tmpdir(), "ulota-personal-e2e-"));
const previous = process.env.SPARK_HOME;
process.env.SPARK_HOME = root;
const databasePath = defaultDatabasePath();
const db = openDatabase({ path: databasePath });
migrate(db);
const owner = createOwnerSession(db, "Personal proof", null);
for (const capability of ["inventory", "todos", "subscriptions"] as const)
  setPersonalCapability(db, owner.userId, capability, true);
db.close();
if (previous === undefined) delete process.env.SPARK_HOME;
else process.env.SPARK_HOME = previous;
const port = await new Promise<number>((resolve_, reject) => {
  const listener = createServer();
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    listener.close(() => resolve_(typeof address === "object" && address ? address.port : 0));
  });
});
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let logs = "";
try {
  const installedEntrypoint = process.env.ULOTA_PERSONAL_HUB_ENTRYPOINT;
  server = spawn(
    installedEntrypoint ? process.execPath : "vp",
    installedEntrypoint
      ? [installedEntrypoint]
      : ["dev", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: installedEntrypoint ? dirname(installedEntrypoint) : resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        SPARK_HOME: root,
        HOME: root,
        HOST: "127.0.0.1",
        PORT: String(port),
        ORIGIN: `http://127.0.0.1:${port}`,
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.on("data", (chunk) => {
    logs = (logs + String(chunk)).slice(-16384);
  });
  server.stderr?.on("data", (chunk) => {
    logs = (logs + String(chunk)).slice(-16384);
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Hub exited: ${logs}`);
    try {
      await fetch(`${base}/login`);
      ready = true;
      break;
    } catch {
      await new Promise((resolve_) => setTimeout(resolve_, 100));
    }
  }
  if (!ready) throw new Error(`Hub did not start: ${logs}`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "en-US" });
  await context.addCookies([{ name: sessionCookieName, value: owner.sessionToken, url: base }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error_) => errors.push(error_.message));
  await page.goto(`${base}/personal/inventory`);
  let editor = page.locator('form[action="?/save"]');
  await editor.locator('[name="name"]').fill("Camera proof");
  await editor.locator('[name="purchase_price"]').fill("600");
  await editor.locator('[name="tags"]').fill("Photo\nTravel");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("rowheader", { name: "Camera proof" }).waitFor();
  await page.goto(`${base}/personal/todos`);
  editor = page.locator('form[action="?/save"]');
  await editor.locator('[name="title"]').fill("Prepare trip");
  await editor.locator('[name="estimated_hours"]').fill("3");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator("strong").filter({ hasText: "Prepare trip" }).waitFor();
  await page.goto(`${base}/personal/subscriptions`);
  editor = page.locator('form[action="?/save"]');
  await editor.locator('[name="name"]').fill("Cloud proof");
  await editor.locator('[name="price"]').fill("12");
  await editor.locator('[name="currency"]').selectOption("USD");
  await editor.locator('[name="start_date"]').fill("2024-01-31");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Cloud proof", { exact: true }).waitFor();
  if (!(await page.locator("body").innerText()).includes("2024-02-29"))
    throw new Error("Calendar renewal was not visible.");

  await page.goto(`${base}/personal/import`);
  const legacy = {
    format: "ulota.personal.bonehub",
    version: 1,
    exportedAt: new Date().toISOString(),
    warnings: [],
    inventory: [
      {
        id: "legacy-proof",
        revision: 1,
        name: "Imported camera",
        purchase_date: "2026-01-01",
        created_at: "created",
        updated_at: "updated",
      },
    ],
    todos: [],
    subscriptions: [],
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "export.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await page.getByRole("heading", { name: "Import report" }).waitFor();
  await page.getByRole("button", { name: "Import new records" }).click();
  await page.getByRole("status").waitFor();
  await page.goto(`${base}/personal/inventory`);
  await page.getByRole("rowheader", { name: "Imported camera" }).waitFor();
  const shots = process.env.ULOTA_PERSONAL_SCREENSHOTS;
  if (shots) await mkdir(shots, { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const path of ["", "inventory", "todos", "subscriptions", "import"]) {
      const response = await page.goto(`${base}/personal${path ? `/${path}` : ""}`);
      if (response?.status() !== 200)
        throw new Error(`Personal ${path} returned ${response?.status()}`);
      if (!(await page.locator(".account").innerText()).includes("Personal proof"))
        throw new Error("Personal account identity is missing.");
      if (
        !path &&
        !(await page.getByRole("button", { name: "Grant access", exact: true }).isDisabled())
      )
        throw new Error("Permission empty state is actionable.");
      if (
        path === "inventory" &&
        name === "mobile" &&
        !(await page.locator("#inventory-scroll-hint").isVisible())
      )
        throw new Error("Mobile inventory actions lack a scrolling cue.");
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
        throw new Error(`Horizontal page overflow: ${name}/${path}`);
      if (shots)
        await page.screenshot({
          path: join(shots, `${name}-${path || "home"}.png`),
          fullPage: true,
        });
    }
  }
  const stranger = await browser.newContext();
  const denied = await stranger.request.get(`${base}/api/v1/personal/inventory`);
  if (denied.status() !== 401)
    throw new Error(`Anonymous personal read returned ${denied.status()}`);
  await stranger.close();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Personal Hub journey passed: inventory/todo/subscription writes, calendar date, desktop/mobile routes, anonymous denial.",
  );
} catch (error_) {
  throw new Error(`${error_ instanceof Error ? error_.message : String(error_)}\n${logs}`, {
    cause: error_,
  });
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    process.kill(-server.pid, "SIGTERM");
    await new Promise<void>((resolve_) => {
      const timer = setTimeout(() => {
        try {
          process.kill(-server!.pid!, "SIGKILL");
        } catch {}
        resolve_();
      }, 5000);
      server!.once("exit", () => {
        clearTimeout(timer);
        resolve_();
      });
    });
  }
  await rm(root, { recursive: true, force: true });
}
