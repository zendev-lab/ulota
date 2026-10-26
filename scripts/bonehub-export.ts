import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  inventoryItemSchema,
  personalTodoSchema,
  personalSubscriptionSchema,
  personalLegacyPackageSchema,
  type PersonalLegacyPackage,
} from "@zendev-lab/spark-protocol";
export interface BoneHubSources {
  inventory?: string;
  todos?: string;
  subscriptions?: string;
}
function snapshot<T>(path: string, read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(resolve(path), {
    readOnly: true,
    timeout: 5000,
    allowExtension: false,
  });
  try {
    db.exec("PRAGMA query_only = ON; BEGIN");
    const result = read(db);
    db.exec("COMMIT");
    return result;
  } finally {
    db.close();
  }
}
function legacyTodoDate(value: unknown): unknown {
  if (typeof value !== "string" || !value.includes("T")) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw new Error("Legacy todo due_date is not a valid UTC ISO timestamp.");
  return value.slice(0, 10);
}
export function exportBoneHub(sources: BoneHubSources, now = new Date()): PersonalLegacyPackage {
  if (!Object.values(sources).some(Boolean))
    throw new Error("Select at least one legacy database.");
  const result: PersonalLegacyPackage = {
    format: "ulota.personal.bonehub",
    version: 1,
    exportedAt: now.toISOString(),
    warnings: [],
    inventory: [],
    todos: [],
    subscriptions: [],
  };
  if (sources.inventory)
    result.inventory = snapshot(sources.inventory, (db) =>
      db
        .prepare("SELECT * FROM items ORDER BY id")
        .all()
        .map((row) => {
          if (row.depreciation_ratio != null && !result.warnings.length)
            result.warnings.push(
              "Legacy depreciation_ratio is not part of the current item model and is not imported. Source databases are retained.",
            );
          return inventoryItemSchema.parse({
            id: row.id,
            revision: 1,
            name: row.name,
            status: row.status,
            purchase_date: row.purchase_date,
            purchase_price: row.purchase_price,
            notes: row.notes ?? row.note ?? "",
            expected_years: row.expected_years ?? null,
            sale_price: row.sale_price ?? 0,
            sale_date: row.sale_date ?? null,
            tags: JSON.parse(String(row.tags)),
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        }),
    );
  if (sources.todos)
    result.todos = snapshot(sources.todos, (db) => {
      const rows = db.prepare("SELECT * FROM tasks ORDER BY id").all();
      const ids = new Set(rows.map((row) => row.id));
      const dependencies = new Map<unknown, string[]>();
      for (const row of db
        .prepare(
          "SELECT task_id,dependency_id FROM task_dependencies ORDER BY task_id,dependency_id",
        )
        .all()) {
        if (!ids.has(row.task_id) || !ids.has(row.dependency_id))
          throw new Error("Legacy task dependency references a missing task.");
        const list = dependencies.get(row.task_id) ?? [];
        list.push(String(row.dependency_id));
        dependencies.set(row.task_id, list);
      }
      return rows.map((row) =>
        personalTodoSchema.parse({
          id: row.id,
          revision: 1,
          title: row.title,
          description: row.description ?? "",
          status: row.status,
          priority: row.priority,
          parent_id: row.parent_id ?? null,
          dependencies: dependencies.get(row.id) ?? [],
          due_date: legacyTodoDate(row.due_date ?? null),
          estimated_hours: row.estimated_hours ?? 0,
          completed_at: row.completed_at ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }),
      );
    });
  if (sources.subscriptions)
    result.subscriptions = snapshot(sources.subscriptions, (db) =>
      db
        .prepare("SELECT * FROM subscriptions ORDER BY id")
        .all()
        .map((row) => {
          if (row.auto_renew !== 0 && row.auto_renew !== 1)
            throw new Error("Legacy subscription auto_renew must be 0 or 1.");
          return personalSubscriptionSchema.parse({
            id: row.id,
            revision: 1,
            name: row.name,
            logo_url: row.logo_url ?? null,
            price: row.price,
            currency: row.currency,
            billing_cycle: row.billing_cycle,
            cycle_amount: row.cycle_amount,
            auto_renew: row.auto_renew === 1,
            start_date: row.start_date,
            next_payment_date: row.next_payment_date ?? null,
            status: row.status,
            category: row.category,
            website: row.website ?? null,
            reminder_days: row.reminder_days,
            payment_method: row.payment_method,
            notes: row.notes ?? "",
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        }),
    );
  return personalLegacyPackageSchema.parse(result);
}
