import type { DatabaseSync } from "node:sqlite";

import {
  applyDaemonSqliteResourceLimits,
  openSqliteDatabase,
  type SparkPaths,
} from "@zendev-lab/spark-platform-node";
import { runDaemonMigrations } from "./migrations/registry.js";

export function openSparkDaemonDatabase(paths: SparkPaths): DatabaseSync {
  const db = openSqliteDatabase(paths.databasePath, { autoVacuum: "incremental" });
  try {
    applyDaemonSqliteResourceLimits(db);
    migrateSparkDaemonDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function migrateSparkDaemonDatabase(db: DatabaseSync): void {
  runDaemonMigrations(db);
}
