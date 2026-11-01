import { error, redirect } from "@sveltejs/kit";
import { getDatabase } from "#lib/server/db.ts";
import { loadWorkspaceByRouteId } from "#lib/server/workspace-routing.ts";
import { workspaceSessionsPath } from "#lib/workspace-routes.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ params }) => {
  const workspace = loadWorkspaceByRouteId(getDatabase(), params.workspaceSlug);
  if (!workspace) {
    throw error(404, "Workspace not found.");
  }

  redirect(303, workspaceSessionsPath(workspace));
};
