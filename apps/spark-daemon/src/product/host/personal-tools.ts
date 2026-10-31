import type { SparkHostAPI, SparkHostContext, ToolConfig } from "@zendev-lab/spark-invocation";
import type { PersonalCapability } from "@zendev-lab/spark-protocol";
import { personalDaemonPaths, requestPersonalHub } from "../../personal.ts";

export interface PersonalToolDefinition {
  name: string;
  capability: PersonalCapability;
  description: string;
  parameters: unknown;
}

export function registerPersonalTools(
  api: SparkHostAPI,
  definitions: readonly PersonalToolDefinition[],
  sparkHome?: string,
) {
  if (definitions.length === 0) return;
  const paths = personalDaemonPaths(sparkHome);
  const names = new Set(definitions.map((definition) => definition.name));
  const policy: NonNullable<ToolConfig["policy"]> = {
    effect: "external_write",
    executionMode: "sequential",
    domains: ["personal"],
    approval: "required",
  };
  for (const definition of definitions) {
    api.registerInternalTool?.({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      policy,
      resolvePolicy: (args) =>
        ["list", "stats", "get"].includes(String(args.action))
          ? { ...policy, effect: "network_read", approval: "none" }
          : policy,
      async execute(_id, params, signal, _update, ctx) {
        const sessionId = requirePersonalToolSession(ctx);
        const result = await requestPersonalHub(
          paths,
          sessionId,
          definition.capability,
          String(params.action),
          (params.input ?? {}) as Record<string, unknown>,
          signal,
          undefined,
          JSON.stringify([sessionId, definition.capability, _id]),
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: { result } };
      },
    });
  }
  api.on?.("before_agent_start", async (_event, ctx) => {
    const active = (api.getActiveTools?.() ?? []).filter((name) => !names.has(name));
    try {
      const sessionId = requirePersonalToolSession(ctx);
      const access = (await requestPersonalHub(paths, sessionId, undefined, "access")) as {
        capabilities: PersonalCapability[];
      };
      active.push(
        ...definitions
          .filter((definition) => access.capabilities.includes(definition.capability))
          .map((definition) => definition.name),
      );
    } catch {
      /* Unavailable personal services must not prevent an ordinary agent turn. */
    }
    api.setActiveTools?.(active);
  });
}

function requirePersonalToolSession(ctx: SparkHostContext) {
  if (ctx.sessionSurface === "channel" || !ctx.sessionId)
    throw new Error("Personal tools require an authorized local or Hub conversation.");
  return ctx.sessionId;
}
