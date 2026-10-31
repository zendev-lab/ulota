import { executePersonalTodo } from "@zendev-lab/ulota-personal-todos";
import { personalTodoSchema } from "@zendev-lab/spark-protocol";
import { executeInventory } from "@zendev-lab/ulota-inventory";
import { inventoryItemSchema, type PersonalCapability } from "@zendev-lab/spark-protocol";
import {
  createPersonalRecordRepository,
  withPersonalOperation,
} from "@zendev-lab/spark-hub-storage-sqlite";
import { requirePersonalCapability } from "@zendev-lab/spark-hub-coordination/personal";
import { getDatabase } from "./db.ts";
export const installedPersonalCapabilities: readonly PersonalCapability[] = ["inventory", "todos"];
export function executeHostedPersonalCapability(
  userId: string,
  capability: PersonalCapability,
  request: { action: string; input: Record<string, unknown>; operationId?: string },
) {
  const db = getDatabase();
  requirePersonalCapability(db, userId, capability);
  const execute = () => {
    switch (capability) {
      case "inventory":
        return executeInventory(inventoryRepositoryForUser(userId), {
          action: request.action,
          input: request.input,
        });
      case "todos":
        return executePersonalTodo(todoRepositoryForUser(userId), {
          action: request.action,
          input: request.input,
        });
      default:
        throw Object.assign(new Error("Personal capability is not installed."), {
          code: "not_found",
        });
    }
  };
  if (["list", "get", "stats"].includes(request.action)) return execute();
  if (!request.operationId)
    throw Object.assign(new Error("A mutation operation id is required."), {
      code: "invalid_input",
    });
  return withPersonalOperation(
    db,
    userId,
    request.operationId,
    { capability, action: request.action, input: request.input },
    execute,
  );
}

export function inventoryRepositoryForUser(userId: string) {
  requirePersonalCapability(getDatabase(), userId, "inventory");
  return createPersonalRecordRepository(getDatabase(), "inventory", userId, (value) =>
    inventoryItemSchema.parse(value),
  );
}

export function todoRepositoryForUser(userId: string) {
  requirePersonalCapability(getDatabase(), userId, "todos");
  return createPersonalRecordRepository(getDatabase(), "todos", userId, (value) =>
    personalTodoSchema.parse(value),
  );
}
