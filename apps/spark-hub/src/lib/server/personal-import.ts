import { createHash } from "node:crypto";
import {
  personalLegacyPackageSchema,
  type PersonalCapability,
  type PersonalLegacyPackage,
} from "@zendev-lab/spark-protocol";
import {
  personalLegacyMapping,
  insertPersonalLegacyMapping,
  withPersonalOperation,
  type PersonalStoredRecord,
} from "@zendev-lab/spark-hub-storage-sqlite";
import { validateTodoRelations } from "@zendev-lab/ulota-personal-todos";
import {
  inventoryRepositoryForUser,
  todoRepositoryForUser,
  subscriptionRepositoryForUser,
} from "./personal-catalog.ts";
import { getDatabase } from "./db.ts";

type ImportStatus = "create" | "skip" | "source_changed" | "target_missing";
export interface ImportReportEntry {
  capability: PersonalCapability;
  legacyId: string;
  status: ImportStatus;
}
interface ImportRepository<T> {
  get(id: string): T | undefined;
  insert(record: T): void;
}
function sourceHash(record: unknown) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}
function prepareRecords<T extends PersonalStoredRecord>(
  userId: string,
  capability: PersonalCapability,
  records: readonly T[],
  repository: ImportRepository<T>,
  transform: (record: T, targetId: string) => T,
) {
  const pending: { legacyId: string; sourceHash: string; record: T }[] = [];
  const report: ImportReportEntry[] = [];
  for (const record of records) {
    const mapping = personalLegacyMapping(getDatabase(), userId, capability, record.id);
    if (mapping) {
      report.push({
        capability,
        legacyId: record.id,
        status: !repository.get(mapping.recordId)
          ? "target_missing"
          : mapping.sourceHash === sourceHash(record)
            ? "skip"
            : "source_changed",
      });
      continue;
    }
    const target = transform(record, crypto.randomUUID());
    pending.push({ legacyId: record.id, sourceHash: sourceHash(record), record: target });
    report.push({ capability, legacyId: record.id, status: "create" });
  }
  return {
    report,
    pending,
    write() {
      for (const row of pending) {
        repository.insert(row.record);
        insertPersonalLegacyMapping(
          getDatabase(),
          userId,
          capability,
          row.legacyId,
          row.record.id,
          row.sourceHash,
        );
      }
    },
  };
}
function prepareImport(userId: string, payload: PersonalLegacyPackage) {
  const groups: { report: ImportReportEntry[]; write(): void }[] = [];
  if (payload.inventory.length) {
    groups.push(
      prepareRecords(
        userId,
        "inventory",
        payload.inventory,
        inventoryRepositoryForUser(userId),
        (record, id) => ({ ...record, id, revision: 1 }),
      ),
    );
  }
  if (payload.subscriptions.length) {
    groups.push(
      prepareRecords(
        userId,
        "subscriptions",
        payload.subscriptions,
        subscriptionRepositoryForUser(userId),
        (record, id) => ({ ...record, id, revision: 1 }),
      ),
    );
  }
  if (payload.todos.length) {
    const repository = todoRepositoryForUser(userId);
    const ids = new Map(
      payload.todos.map((record) => [
        record.id,
        personalLegacyMapping(getDatabase(), userId, "todos", record.id)?.recordId ??
          crypto.randomUUID(),
      ]),
    );
    const resolve = (legacyId: string) => {
      const id =
        ids.get(legacyId) ??
        personalLegacyMapping(getDatabase(), userId, "todos", legacyId)?.recordId;
      if (!id)
        throw Object.assign(new Error("An imported todo references a missing legacy task."), {
          code: "invalid_relation",
        });
      return id;
    };
    const plan = prepareRecords(userId, "todos", payload.todos, repository, (record) => ({
      ...record,
      id: resolve(record.id),
      revision: 1,
      parent_id: record.parent_id ? resolve(record.parent_id) : null,
      dependencies: record.dependencies.map(resolve),
    }));
    validateTodoRelations([...repository.list(), ...plan.pending.map((row) => row.record)]);
    groups.push(plan);
  }
  return {
    report: groups.flatMap((group) => group.report),
    write() {
      for (const group of groups) group.write();
    },
  };
}
export function previewPersonalImport(userId: string, raw: unknown) {
  const payload = personalLegacyPackageSchema.parse(raw);
  return { entries: prepareImport(userId, payload).report, warnings: payload.warnings };
}
export function commitPersonalImport(userId: string, raw: unknown, operationId: string) {
  if (!operationId || operationId.length > 256)
    throw Object.assign(new Error("Import operation id is required."), { code: "invalid_input" });
  const payload = personalLegacyPackageSchema.parse(raw);
  return withPersonalOperation(
    getDatabase(),
    userId,
    operationId,
    { kind: "legacy-import", payload },
    () => {
      const plan = prepareImport(userId, payload);
      plan.write();
      return { entries: plan.report, warnings: payload.warnings };
    },
  );
}
