import type { SparkHostAPI } from "@zendev-lab/spark-invocation";
import { inventoryToolParametersSchema } from "@zendev-lab/spark-protocol";
import { registerPersonalTools } from "./personal-tools.ts";
export function registerPersonalCapabilities(api: SparkHostAPI, sparkHome?: string) {
  registerPersonalTools(
    api,
    [
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
