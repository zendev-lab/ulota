import { getCurrentHubSession } from "$lib/server/auth";
import { getDatabase } from "$lib/server/db";
import type { LayoutServerLoad } from "./$types";
export const load: LayoutServerLoad = ({ locals }) => {
  const db = getDatabase();
  const session = getCurrentHubSession(db, locals.sessionToken);
  const account = session
    ? (db
        .prepare("SELECT display_name AS displayName FROM users WHERE id=?")
        .get(session.userId) as { displayName: string } | undefined)
    : undefined;
  return {
    personalUser: session
      ? { ...session, displayName: account?.displayName ?? session.userId }
      : null,
  };
};
