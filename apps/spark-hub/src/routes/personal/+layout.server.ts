import { getCurrentHubSession } from "$lib/server/auth";
import { getDatabase } from "$lib/server/db";
import type { LayoutServerLoad } from "./$types";
export const load: LayoutServerLoad = ({ locals }) => ({
  personalUser: getCurrentHubSession(getDatabase(), locals.sessionToken),
});
