import { error, json, type RequestHandler } from "@sveltejs/kit";
import { personalCapabilitySchema, personalWebOperationSchema } from "@zendev-lab/spark-protocol";
import { executeHostedPersonalCapability } from "$lib/server/personal-catalog";
import { personalError, requirePersonalUser } from "$lib/server/personal-auth";
export const GET: RequestHandler = ({ locals, params }) => {
  const userId = requirePersonalUser(locals.sessionToken);
  const capability = personalCapabilitySchema.safeParse(params.capability);
  if (!capability.success) error(404, "Personal tool not found.");
  try {
    return json(
      {
        result: executeHostedPersonalCapability(userId, capability.data, {
          action: "list",
          input: {},
        }),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (caught) {
    personalError(caught);
  }
};
export const POST: RequestHandler = async ({ locals, params, request }) => {
  const capability = personalCapabilitySchema.safeParse(params.capability);
  const input = personalWebOperationSchema.safeParse(await request.json().catch(() => undefined));
  const userId = requirePersonalUser(locals.sessionToken);
  if (!capability.success) error(404, "Personal tool not found.");
  if (!input.success) error(400, "Invalid personal operation.");
  try {
    return json(
      { result: executeHostedPersonalCapability(userId, capability.data, input.data) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (caught) {
    personalError(caught);
  }
};
