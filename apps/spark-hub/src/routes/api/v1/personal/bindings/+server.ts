import {
  personalBindingCreateRequestSchema,
  personalBindingRevokeRequestSchema,
} from "@zendev-lab/spark-protocol";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  createPersonalBinding,
  listPersonalBindings,
  revokePersonalBinding,
} from "@zendev-lab/spark-hub-coordination/personal";
import { ensureHubInstanceId } from "@zendev-lab/spark-hub-storage-sqlite";
import { getDatabase } from "$lib/server/db";
import { personalError, requirePersonalUser } from "$lib/server/personal-auth";

export const GET: RequestHandler = ({ locals }) =>
  json({ bindings: listPersonalBindings(getDatabase(), requirePersonalUser(locals.sessionToken)) });
export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = requirePersonalUser(locals.sessionToken);
  const parsed = personalBindingCreateRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) error(400, "Invalid binding request.");
  const input = parsed.data;
  try {
    return json(
      createPersonalBinding(getDatabase(), {
        userId,
        runtimeId: input.runtimeId,
        hubInstanceId: ensureHubInstanceId(getDatabase()),
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (caught) {
    personalError(caught);
  }
};
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const userId = requirePersonalUser(locals.sessionToken);
  const parsed = personalBindingRevokeRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) error(400, "Invalid revoke request.");
  const input = parsed.data;
  return json({ revoked: revokePersonalBinding(getDatabase(), userId, input.id) });
};
