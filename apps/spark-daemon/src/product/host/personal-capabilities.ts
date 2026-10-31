import type { SparkHostAPI } from "@zendev-lab/spark-invocation";
import { registerPersonalTools } from "./personal-tools.ts";
export function registerPersonalCapabilities(api: SparkHostAPI, sparkHome?: string) {
  registerPersonalTools(api, [], sparkHome);
}
