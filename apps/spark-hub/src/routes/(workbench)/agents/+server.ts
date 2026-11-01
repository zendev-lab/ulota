import { getDatabase } from "#lib/server/db.ts";
import { redirectToLatestWorkspace } from "#lib/server/workspace-routing.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => redirectToLatestWorkspace(getDatabase(), "/artifacts");
