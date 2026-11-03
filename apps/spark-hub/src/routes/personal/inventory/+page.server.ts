import { randomUUID } from "node:crypto";
import { fail } from "@sveltejs/kit";
import { inventorySnapshot } from "@zendev-lab/ulota-inventory";
import { personalError, requirePersonalUser } from "$lib/server/personal-auth";
import {
  executeHostedPersonalCapability,
  inventoryRepositoryForUser,
} from "$lib/server/personal-catalog";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
  const userId = requirePersonalUser(locals.sessionToken);
  try {
    const repository = inventoryRepositoryForUser(userId);
    const snapshot = inventorySnapshot(repository, {
      searchQuery: url.searchParams.get("q") ?? "",
      selectedStatus: url.searchParams.get("status") || null,
      selectedTag: url.searchParams.get("tag") || null,
    });
    const selected = url.searchParams.get("edit")
      ? repository.get(url.searchParams.get("edit")!)
      : undefined;
    return {
      ...snapshot,
      selected,
      allTags: [...new Set(repository.list().flatMap((item) => item.tags))].sort((a, b) =>
        a.localeCompare(b),
      ),
      today: new Date().toISOString().slice(0, 10),
      operationId: randomUUID(),
      deleteOperations: Object.fromEntries(snapshot.items.map((item) => [item.id, randomUUID()])),
    };
  } catch (caught) {
    personalError(caught);
  }
};
function failure(caught: unknown, values: Record<string, string>) {
  const code =
    caught && typeof caught === "object" && "code" in caught
      ? String(caught.code)
      : "invalid_input";
  return fail(code === "conflict" ? 409 : 400, { failed: true, code, values });
}
export const actions: Actions = {
  save: async ({ locals, request }) => {
    const form = await request.formData();
    const userId = requirePersonalUser(locals.sessionToken);
    const values = Object.fromEntries(
      [...form.entries()].filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const input = {
      name: values.name,
      status: values.status,
      purchase_date: values.purchase_date,
      purchase_price: Number(values.purchase_price),
      notes: values.notes ?? "",
      expected_years: values.expected_years ? Number(values.expected_years) : null,
      sale_price: Number(values.sale_price ?? 0),
      sale_date: values.sale_date || null,
      tags: (values.tags ?? "").split(/\r?\n/u).filter(Boolean),
    };
    try {
      if (values.id) {
        const patch: Record<string, unknown> = { ...input };
        if (!("tags" in values) || values.tags === values.originalTagsText) delete patch.tags;
        executeHostedPersonalCapability(userId, "inventory", {
          action: "update",
          input: { id: values.id, expectedRevision: Number(values.expectedRevision), patch },
          operationId: values.operationId,
        });
      } else
        executeHostedPersonalCapability(userId, "inventory", {
          action: "create",
          input,
          operationId: values.operationId,
        });
      return { saved: true };
    } catch (caught) {
      return failure(caught, values);
    }
  },
  delete: async ({ locals, request }) => {
    const form = await request.formData();
    const userId = requirePersonalUser(locals.sessionToken);
    try {
      executeHostedPersonalCapability(userId, "inventory", {
        action: "delete",
        input: {
          id: String(form.get("id")),
          expectedRevision: Number(form.get("expectedRevision")),
        },
        operationId: String(form.get("operationId") ?? ""),
      });
      return { saved: true };
    } catch (caught) {
      return failure(caught, {});
    }
  },
};
