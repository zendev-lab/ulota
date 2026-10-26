import { redirect } from "@sveltejs/kit";
import { getDatabase } from "#lib/server/db.ts";
import { loadShellWorkspaceLayout } from "#lib/server/shell-layout.ts";
import { workspaceSessionsPath } from "#lib/workspace-routes.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, locals, url }) => {
  const layout = loadShellWorkspaceLayout({
    cookies,
    pathname: url.pathname,
    protocol: url.protocol,
    preferredWorkspaceId: null,
    preferredWorkspaceSlug: url.searchParams.get("workspace"),
    authorizedWorkspaceIds: locals.authorizedWorkspaceIds ?? null,
    authorizedDaemonIds: locals.authorizedDaemonIds ?? null,
  });
  const workspace = layout.activeWorkspace;
  if (!workspace) redirect(303, `/${url.search}`);
  redirect(303, `${workspaceSessionsPath(workspace)}${url.search}`);
};
