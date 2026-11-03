import { installedPersonalCapabilities } from "$lib/server/personal-catalog";
import { fail, redirect } from "@sveltejs/kit";
import {
  createLocalOwnerSession,
  ensureLocalSystemUser,
  getCurrentHubSession,
  setSessionCookie,
} from "$lib/server/auth";
import { isLoopbackClientAddress } from "$lib/server/remote-access";
import { getDatabase } from "$lib/server/db";
import { personalError, requirePersonalUser } from "$lib/server/personal-auth";
import {
  createPersonalBinding,
  listPersonalBindings,
  listPersonalCapabilities,
  listPersonalSessionGrants,
  setPersonalCapability,
  revokePersonalBinding,
  grantPersonalSession,
  revokePersonalSession,
} from "@zendev-lab/spark-hub-coordination/personal";
import { ensureHubInstanceId } from "@zendev-lab/spark-hub-storage-sqlite";
import { listUserDaemonGrantIds } from "@zendev-lab/spark-hub-coordination/hub-access";
import { personalCapabilitySchema, createId } from "@zendev-lab/spark-protocol";
import {
  listPersonalConversations,
  createPersonalConversation,
} from "$lib/server/personal-sessions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, getClientAddress }) => {
  const db = getDatabase();
  const user = getCurrentHubSession(db, locals.sessionToken);
  if (!user)
    return { signedIn: false as const, localSignIn: isLoopbackClientAddress(getClientAddress()) };
  const daemonIds = listUserDaemonGrantIds(db, user.userId);
  const daemons = (
    db
      .prepare("SELECT id, name FROM runtime_connections WHERE status != 'disabled' ORDER BY name")
      .all() as { id: string; name: string }[]
  ).filter((row) => daemonIds.includes(row.id));
  return {
    signedIn: true as const,
    installed: installedPersonalCapabilities,
    enabled: listPersonalCapabilities(db, user.userId),
    bindings: listPersonalBindings(db, user.userId),
    daemons,
    sessionOptions: (
      db
        .prepare(
          "SELECT runtime_id AS runtimeId, session_id AS sessionId, record_json AS record FROM runtime_session_projections WHERE scope = 'workspace' ORDER BY projected_at DESC",
        )
        .all() as { runtimeId: string; sessionId: string; record: string }[]
    )
      .filter((row) => daemonIds.includes(row.runtimeId))
      .map((row) => ({
        runtimeId: row.runtimeId,
        sessionId: row.sessionId,
        name: JSON.parse(row.record).name ?? row.sessionId,
      })),
    grants: listPersonalSessionGrants(db, user.userId),
    conversations: listPersonalConversations(user.userId),
    newSessionId: createId("sess"),
  };
};

export const actions: Actions = {
  localSignIn: ({ cookies, getClientAddress, url }) => {
    if (!isLoopbackClientAddress(getClientAddress())) return fail(403, { failed: true });
    ensureLocalSystemUser(getDatabase());
    setSessionCookie(cookies, createLocalOwnerSession(getDatabase()), {
      secure: url.protocol === "https:",
    });
    redirect(303, "/personal");
  },
  toggle: async ({ locals, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    const form = await request.formData();
    const capability = personalCapabilitySchema.safeParse(form.get("capability"));
    if (!capability.success || !installedPersonalCapabilities.includes(capability.data))
      return fail(400, { failed: true });
    setPersonalCapability(getDatabase(), userId, capability.data, form.get("enabled") === "true");
    return { saved: true };
  },
  pair: async ({ locals, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    const runtimeId = String((await request.formData()).get("runtimeId") ?? "");
    try {
      return {
        pairing: createPersonalBinding(getDatabase(), {
          userId,
          runtimeId,
          hubInstanceId: ensureHubInstanceId(getDatabase()),
        }),
      };
    } catch (caught) {
      personalError(caught);
    }
  },
  revoke: async ({ locals, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    revokePersonalBinding(
      getDatabase(),
      userId,
      String((await request.formData()).get("id") ?? ""),
    );
    return { saved: true };
  },
  grant: async ({ locals, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    const form = await request.formData();
    const capability = personalCapabilitySchema.safeParse(form.get("capability"));
    if (!capability.success || !installedPersonalCapabilities.includes(capability.data))
      return fail(400, { failed: true });
    try {
      const input = {
        bindingId: String(form.get("bindingId") ?? ""),
        sessionId: String(form.get("sessionId") ?? ""),
        capability: capability.data,
        canWrite: form.get("canWrite") === "on",
      };
      if (form.get("revoke") === "true")
        revokePersonalSession(
          getDatabase(),
          userId,
          input.bindingId,
          input.sessionId,
          input.capability,
        );
      else grantPersonalSession(getDatabase(), userId, input);
      return { saved: true };
    } catch (caught) {
      personalError(caught);
    }
  },
  conversation: async ({ locals, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    const form = await request.formData();
    const sessionId = String(form.get("sessionId") ?? "");
    if (!/^sess_[a-f0-9]{32}$/u.test(sessionId)) return fail(400, { failed: true });
    try {
      await createPersonalConversation(userId, String(form.get("bindingId") ?? ""), sessionId);
    } catch {
      return fail(503, { failed: true, retrySessionId: sessionId });
    }
    redirect(303, `/personal/sessions/${sessionId}`);
  },
};
