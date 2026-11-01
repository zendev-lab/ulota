import { redirect } from "@sveltejs/kit";
import { getDatabase } from "#lib/server/db.ts";
import { requireWorkspaceByRouteId } from "#lib/server/workspace-routing.ts";
import { workspacePath } from "#lib/workspace-routes.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
  const workspace = requireWorkspaceByRouteId(getDatabase(), params.workspaceId);
  throw redirect(307, workspacePath(workspace, "/artifacts"));
};
