import { loadCanonicalWorkspaceRoute } from "#lib/server/canonical-workspace-route.ts";
import { actions as sessionActions, loadSessionsPage } from "#lib/server/session-page-routes.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) =>
  await loadCanonicalWorkspaceRoute(event, loadSessionsPage);

export const actions: Actions = sessionActions;
