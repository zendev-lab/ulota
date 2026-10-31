import { error, json, type RequestHandler } from "@sveltejs/kit";
import { personalExecuteRequestSchema } from "@zendev-lab/spark-protocol";
import { authorizePersonalSession } from "@zendev-lab/spark-hub-coordination/personal";
import { getDatabase } from "$lib/server/db";
import { executeHostedPersonalCapability } from "$lib/server/personal-catalog";
import { personalError, requirePersonalDevice } from "$lib/server/personal-auth";
export const POST: RequestHandler = async ({ request }) => {
  const input = personalExecuteRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!input.success) error(400, "Invalid personal operation.");
  const binding = requirePersonalDevice(request);
  const { sessionId, capability, ...operation } = input.data;
  try {
    authorizePersonalSession(
      getDatabase(),
      binding,
      sessionId,
      capability,
      !["list", "get", "stats"].includes(operation.action),
    );
    return json(
      { result: executeHostedPersonalCapability(binding.userId, capability, operation) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (caught) {
    personalError(caught);
  }
};
