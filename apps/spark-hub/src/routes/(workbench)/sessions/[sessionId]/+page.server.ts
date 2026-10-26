import { error, redirect } from "@sveltejs/kit";
import { getDatabase } from "#lib/server/db.ts";
import { getProjectedManagedSessionForHub } from "#lib/server/managed-sessions.ts";
import { loadWorkspaceByRouteId } from "#lib/server/workspace-routing.ts";
import { workspaceIdForWorkbenchSession } from "#lib/workbench-session-scope.ts";
import { workspaceSessionPath } from "#lib/workspace-routes.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params, url }) => {
  const session = getProjectedManagedSessionForHub(params.sessionId);
  const workspaceId = session ? workspaceIdForWorkbenchSession(session) : null;
  if (!session || !workspaceId || session.placement === "archived") {
    throw error(404, "Session not found");
  }
  const workspace = loadWorkspaceByRouteId(getDatabase(), workspaceId);
  if (!workspace) throw error(404, "Session not found");
  redirect(303, `${workspaceSessionPath(workspace, session.sessionId)}${url.search}`);
};
