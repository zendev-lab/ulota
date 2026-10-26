import { executeSparkDaemonHumanInteractionControl } from "../../core/human-interaction-control.ts";
import { requireHumanWaitRegistry } from "../helpers.ts";
import type { LocalRpcDispatchContext } from "./context.ts";

export async function handleHumanRequest(
  { options }: LocalRpcDispatchContext,
  request: Parameters<typeof executeSparkDaemonHumanInteractionControl>[1],
) {
  return executeSparkDaemonHumanInteractionControl(
    { waits: requireHumanWaitRegistry(options), respond: options.respondHumanInteraction },
    request,
  );
}
