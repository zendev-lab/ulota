import type { SparkHostAPI } from "@zendev-lab/spark-invocation";
import {
  inventoryToolParametersSchema,
  personalTodoToolParametersSchema,
} from "@zendev-lab/spark-protocol";
import { registerPersonalTools } from "./personal-tools.ts";
export function registerPersonalCapabilities(api: SparkHostAPI, sparkHome?: string) {
  registerPersonalTools(
    api,
    [
      {
        name: "personal_todo",
        capability: "todos",
        description:
          "Manage the owner's personal todos, separate from agent work checklists. Parent and dependency relations must reference this owner's existing tasks and be acyclic. Remove references before deleting a task. Mutations require current revision.",
        parameters: personalTodoToolParametersSchema.toJSONSchema(),
      },
      {
        name: "inventory",
        capability: "inventory",
        description:
          "Manage the account owner's inventory. Filter list and statistics together; monetary values have no inferred currency. current_asset_value means held purchase cost, not market valuation. Mutations require the current revision.",
        parameters: inventoryToolParametersSchema.toJSONSchema(),
      },
    ],
    sparkHome,
  );
}
