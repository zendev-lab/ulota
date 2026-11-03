import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  authorizePersonalSession,
  listPersonalCapabilities,
  PersonalAccessError,
} from "@zendev-lab/spark-hub-coordination/personal";
import { getDatabase } from "$lib/server/db";
import { requirePersonalDevice } from "$lib/server/personal-auth";
export const POST: RequestHandler = async ({ request }) => {
  const binding = requirePersonalDevice(request);
  const input = await request.json().catch(() => undefined);
  if (
    !input ||
    typeof input.sessionId !== "string" ||
    Object.keys(input).some((key) => key !== "sessionId")
  )
    error(400, "Invalid personal session request.");
  const db = getDatabase();
  const capabilities = listPersonalCapabilities(db, binding.userId).filter((capability) => {
    try {
      authorizePersonalSession(db, binding, input.sessionId, capability, false);
      return true;
    } catch (caught) {
      if (caught instanceof PersonalAccessError) return false;
      throw caught;
    }
  });
  return json({ capabilities }, { headers: { "cache-control": "no-store" } });
};
