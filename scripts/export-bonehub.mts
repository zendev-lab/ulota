import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { exportBoneHub } from "./bonehub-export.ts";
const { values } = parseArgs({
  options: {
    inventory: { type: "string" },
    todos: { type: "string" },
    subscriptions: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
  strict: true,
});
if (values.help) {
  process.stdout.write(
    "Usage: pnpm exec tsx scripts/export-bonehub.mts --inventory /path/item_manager.db --todos /path/todo_manager.db --subscriptions /path/subscription_manager.db --output /private/export.json\nSelect at least one database. Source databases are opened read-only, including their committed WAL state. Existing output files are never overwritten.\n",
  );
} else {
  if (!values.output) throw new Error("An explicit --output path is required.");
  const exported = exportBoneHub({
    inventory: values.inventory,
    todos: values.todos,
    subscriptions: values.subscriptions,
  });
  writeFileSync(values.output, JSON.stringify(exported, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `Exported ${exported.inventory.length} items, ${exported.todos.length} todos, ${exported.subscriptions.length} subscriptions. Upload the package at /personal/import on your Hub.\n`,
  );
}
