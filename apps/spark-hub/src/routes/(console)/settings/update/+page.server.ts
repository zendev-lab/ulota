import { readHubUpdateProjection } from "#lib/server/update-projection.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
  update: await readHubUpdateProjection(),
});
