import { mkdtempSync, readFileSync, rmSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { exportBoneHub } from "../scripts/bonehub-export.ts";
function itemDatabase(path: string, column = "note") {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE items (id TEXT PRIMARY KEY,name TEXT,status TEXT,purchase_date TEXT,purchase_price REAL,${column} TEXT,expected_years INTEGER,depreciation_ratio REAL,sale_date TEXT,sale_price REAL,tags TEXT,created_at TEXT,updated_at TEXT)`,
  );
  db.prepare("INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "legacy-item",
    "Camera",
    "Active",
    "2026-10-01",
    600,
    null,
    null,
    0.2,
    null,
    null,
    JSON.stringify(["Photo", "one\ntwo"]),
    "created",
    "updated",
  );
  return db;
}
for (const column of ["note", "notes"])
  it(`exports the legacy ${column} schema and committed WAL without migrating source data`, () => {
    const root = mkdtempSync(join(tmpdir(), "ulota-legacy-"));
    const path = join(root, "item_manager.db");
    const db = itemDatabase(path, column);
    try {
      const main = readFileSync(path);
      const wal = readFileSync(path + "-wal");
      const result = exportBoneHub({ inventory: path });
      expect(result.inventory[0]).toMatchObject({
        id: "legacy-item",
        notes: "",
        sale_price: 0,
        expected_years: null,
        tags: ["Photo", "one\ntwo"],
      });
      expect(result.warnings).toHaveLength(1);
      expect(readFileSync(path)).toEqual(main);
      expect(readFileSync(path + "-wal")).toEqual(wal);
      expect(
        db
          .prepare("PRAGMA table_info(items)")
          .all()
          .map((row) => row.name),
      ).toContain(column);
      expect(result.version).toBe(1);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
it("exports separate todo dependencies and integer subscription booleans", () => {
  const root = mkdtempSync(join(tmpdir(), "ulota-legacy-relations-"));
  const todos = join(root, "todo_manager.db");
  const subscriptions = join(root, "subscription_manager.db");
  const todo = new DatabaseSync(todos);
  const sub = new DatabaseSync(subscriptions);
  try {
    todo.exec(
      "CREATE TABLE tasks (id TEXT PRIMARY KEY,title TEXT,description TEXT,status TEXT,priority INTEGER,parent_id TEXT,due_date TEXT,estimated_hours REAL,completed_at TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE task_dependencies (task_id TEXT,dependency_id TEXT)",
    );
    todo
      .prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("a", "Parent", null, "Todo", 2, null, null, null, null, "created", "updated");
    todo
      .prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        "b",
        "Child",
        "Desc",
        "Completed",
        5,
        "a",
        "2026-10-23T00:00:00.000Z",
        3,
        "finished",
        "created",
        "updated",
      );
    todo.prepare("INSERT INTO task_dependencies VALUES (?,?)").run("b", "a");
    sub.exec(
      "CREATE TABLE subscriptions (id TEXT PRIMARY KEY,name TEXT,logo_url TEXT,price REAL,currency TEXT,billing_cycle TEXT,cycle_amount INTEGER,auto_renew INTEGER,start_date TEXT,next_payment_date TEXT,status TEXT,category TEXT,website TEXT,reminder_days INTEGER,payment_method TEXT,notes TEXT,created_at TEXT,updated_at TEXT)",
    );
    sub
      .prepare("INSERT INTO subscriptions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        "s",
        "Service",
        null,
        12,
        "USD",
        "Monthly",
        1,
        0,
        "2026-01-31",
        null,
        "Paused",
        "Work",
        null,
        3,
        "Card",
        null,
        "created",
        "updated",
      );
    const result = exportBoneHub({ todos, subscriptions });
    expect(result.todos[1]).toMatchObject({
      parent_id: "a",
      due_date: "2026-10-23",
      dependencies: ["a"],
      completed_at: "finished",
    });
    expect(result.todos[0]?.estimated_hours).toBe(0);
    expect(result.subscriptions[0]).toMatchObject({
      auto_renew: false,
      next_payment_date: null,
      notes: "",
    });
    sub.exec("UPDATE subscriptions SET auto_renew=2");
    expect(() => exportBoneHub({ subscriptions })).toThrow(/0 or 1/);
    todo.exec("INSERT INTO task_dependencies VALUES ('a','missing')");
    expect(() => exportBoneHub({ todos })).toThrow(/missing task/);
  } finally {
    todo.close();
    sub.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it("requires explicit paths, rejects invalid JSON tags, and never overwrites an export", () => {
  const root = mkdtempSync(join(tmpdir(), "ulota-legacy-cli-"));
  const path = join(root, "item_manager.db");
  const db = itemDatabase(path);
  const output = join(root, "export.json");
  try {
    expect(() => exportBoneHub({})).toThrow(/Select/);
    expect(() => exportBoneHub({ inventory: join(root, "missing.db") })).toThrow();
    expect(existsSync(join(root, "missing.db"))).toBe(false);
    const args = [
      "--experimental-strip-types",
      "scripts/export-bonehub.mts",
      "--inventory",
      path,
      "--output",
      output,
    ];
    execFileSync(process.execPath, args, { cwd: process.cwd() });
    const first = readFileSync(output);
    expect(() =>
      execFileSync(process.execPath, args, { cwd: process.cwd(), stdio: "pipe" }),
    ).toThrow();
    expect(readFileSync(output)).toEqual(first);
    db.exec("UPDATE items SET tags='invalid-json'");
    expect(() => exportBoneHub({ inventory: path })).toThrow();
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("treats source arguments as filesystem paths without SQLite URI options", () => {
  const root = mkdtempSync(join(tmpdir(), "ulota-legacy-path-"));
  const path = join(root, "items.db");
  const db = itemDatabase(path);
  try {
    expect(exportBoneHub({ inventory: relative(process.cwd(), path) }).inventory[0]?.id).toBe(
      "legacy-item",
    );
    expect(() => exportBoneHub({ inventory: `file:${path}?mode=ro` })).toThrow();
    expect(db.prepare("SELECT count(*) AS count FROM items").get()?.count).toBe(1);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it.each([false, true])("refuses an output symlink even when its target exists: %s", (exists) => {
  const root = mkdtempSync(join(tmpdir(), "ulota-legacy-link-"));
  const path = join(root, "items.db");
  const db = itemDatabase(path);
  const output = join(root, "export.json");
  const target = join(root, "target.json");
  try {
    if (exists) writeFileSync(target, "keep");
    symlinkSync(target, output);
    expect(() =>
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/export-bonehub.mts",
          "--inventory",
          path,
          "--output",
          output,
        ],
        { cwd: process.cwd(), stdio: "pipe" },
      ),
    ).toThrow();
    expect(existsSync(target)).toBe(exists);
    if (exists) expect(readFileSync(target, "utf8")).toBe("keep");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
