import { error, json, type RequestHandler } from "@sveltejs/kit";
import { revokePersonalBindingCredential } from "@zendev-lab/spark-hub-coordination/personal";
import { getDatabase } from "$lib/server/db";
import { personalError } from "$lib/server/personal-auth";
export const POST: RequestHandler = ({ request }) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) error(401, "Personal authorization is required.");
  try {
    return json(revokePersonalBindingCredential(getDatabase(), authorization.slice(7)));
  } catch (caught) {
    personalError(caught);
  }
};
