import { error } from "@sveltejs/kit";
import { getCurrentHubSession } from "./auth.ts";
import { getDatabase } from "./db.ts";
import {
  authenticatePersonalBinding,
  PersonalAccessError,
} from "@zendev-lab/spark-hub-coordination/personal";

export function requirePersonalUser(sessionToken: string | null) {
  const session = getCurrentHubSession(getDatabase(), sessionToken);
  if (!session) error(401, "A Hub user session is required for personal data.");
  return session.userId;
}

export function personalError(caught: unknown): never {
  if (caught instanceof PersonalAccessError) {
    error(caught.code === "unauthorized" ? 401 : caught.code === "conflict" ? 409 : 403, {
      message: caught.message,
      code: caught.code,
    });
  }
  throw caught;
}

export function requirePersonalDevice(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    error(401, "Personal device authorization is required.");
  try {
    return authenticatePersonalBinding(getDatabase(), authorization.slice(7));
  } catch (caught) {
    personalError(caught);
  }
}
