import { error, json, type RequestHandler } from "@sveltejs/kit";
import { personalBindRequestSchema } from "@zendev-lab/spark-protocol";
import { redeemPersonalBinding } from "@zendev-lab/spark-hub-coordination/personal";
import { RuntimeAccessTokenError } from "@zendev-lab/spark-hub-coordination/runtime-registration";
import { getDatabase } from "$lib/server/db";
import { personalError } from "$lib/server/personal-auth";

export const POST: RequestHandler = async ({ request }) => {
  const parsed = personalBindRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) error(400, "Invalid personal pairing request.");
  const { token, localOwnerId, runtimeId, runtimeToken } = parsed.data;
  try {
    return json(
      redeemPersonalBinding(getDatabase(), token, localOwnerId, runtimeId, runtimeToken),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof RuntimeAccessTokenError) error(401, "Daemon credentials are invalid.");
    personalError(caught);
  }
};
