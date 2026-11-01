import { invokeSparkWebRpc } from "#lib/server/rpc.ts";
import { listSparkWebSessions } from "#lib/server/session-list.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const listed = await invokeSparkWebRpc("workspace.list", {});
  const sessions = await listSparkWebSessions();
  return { workspaces: listed.workspaces, sessions };
};
