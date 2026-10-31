import { randomUUID } from "node:crypto";
import { fail, isHttpError } from "@sveltejs/kit";
import { personalLegacyPackageSchema } from "@zendev-lab/spark-protocol";
import { requirePersonalUser } from "$lib/server/personal-auth";
import { previewPersonalImport, commitPersonalImport } from "$lib/server/personal-import";
import type { Actions, PageServerLoad } from "./$types";
const maximumBytes = 10 * 1024 * 1024;
export const load: PageServerLoad = ({ locals }) => {
  requirePersonalUser(locals.sessionToken);
  return { operationId: randomUUID(), maximumBytes };
};
function failure(caught: unknown) {
  if (isHttpError(caught)) throw caught;
  const code = caught instanceof Error && "code" in caught ? String(caught.code) : "invalid_input";
  return fail(code === "disabled" || code === "forbidden" ? 403 : 400, { failed: true, code });
}
export const actions: Actions = {
  preview: async ({ locals, request }) => {
    requirePersonalUser(locals.sessionToken);
    const form = await request.formData();
    try {
      const file = form.get("package");
      if (!(file instanceof File) || file.size > maximumBytes)
        throw new Error("Invalid import package.");
      const payload = personalLegacyPackageSchema.parse(JSON.parse(await file.text()));
      return {
        preview: previewPersonalImport(requirePersonalUser(locals.sessionToken), payload),
        payload: JSON.stringify(payload),
        operationId: randomUUID(),
      };
    } catch (caught) {
      return failure(caught);
    }
  },
  commit: async ({ locals, request }) => {
    requirePersonalUser(locals.sessionToken);
    const form = await request.formData();
    try {
      const raw = form.get("payload");
      if (typeof raw !== "string" || Buffer.byteLength(raw) > maximumBytes)
        throw new Error("Invalid import package.");
      const payload = personalLegacyPackageSchema.parse(JSON.parse(raw));
      const report = commitPersonalImport(
        requirePersonalUser(locals.sessionToken),
        payload,
        String(form.get("operationId") ?? ""),
      );
      return { imported: report };
    } catch (caught) {
      return failure(caught);
    }
  },
};
