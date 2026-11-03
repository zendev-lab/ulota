import { fail } from "@sveltejs/kit";
import { invokeSparkWebRpc } from "$lib/server/rpc";
import type { Actions, PageServerLoad } from "./$types";
export const load: PageServerLoad = async () => ({
  personal: await invokeSparkWebRpc("daemon.personal", { action: "status" }),
});
export const actions: Actions = {
  bind: async ({ request }) => {
    const form = await request.formData();
    try {
      await invokeSparkWebRpc("daemon.personal", {
        action: "bind",
        serverUrl: String(form.get("serverUrl") ?? ""),
        token: String(form.get("token") ?? ""),
      });
      return { saved: true };
    } catch {
      return fail(400, { failed: true });
    }
  },
  unbind: async () => {
    try {
      await invokeSparkWebRpc("daemon.personal", { action: "unbind" });
      return { saved: true };
    } catch {
      return fail(503, { failed: true });
    }
  },
};
