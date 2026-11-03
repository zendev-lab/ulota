import { randomUUID } from "node:crypto";
import { fail } from "@sveltejs/kit";
import { subscriptionSnapshot } from "@zendev-lab/ulota-subscriptions";
import { personalError, requirePersonalUser } from "$lib/server/personal-auth";
import {
  executeHostedPersonalCapability,
  subscriptionRepositoryForUser,
} from "$lib/server/personal-catalog";
import type { Actions, PageServerLoad } from "./$types";
export const load: PageServerLoad = ({ locals, url }) => {
  const userId = requirePersonalUser(locals.sessionToken);
  try {
    const repository = subscriptionRepositoryForUser(userId);
    return {
      ...subscriptionSnapshot(repository, {
        search: url.searchParams.get("q") ?? "",
        status: url.searchParams.get("status") || null,
        currency: url.searchParams.get("currency") || null,
        category: url.searchParams.get("category") || null,
      }),
      selected: repository.get(url.searchParams.get("edit") ?? ""),
      categories: [...new Set(repository.list().map((item) => item.category))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
      today: new Date().toISOString().slice(0, 10),
      operationId: randomUUID(),
      recordOperations: Object.fromEntries(
        repository
          .list()
          .map((item) => [
            item.id,
            { delete: randomUUID(), renew: randomUUID(), cancel: randomUUID() },
          ]),
      ),
    };
  } catch (caught) {
    personalError(caught);
  }
};
function failure(caught: unknown, values: Record<string, string> = {}) {
  const code = caught instanceof Error && "code" in caught ? String(caught.code) : "invalid_input";
  return fail(code === "conflict" ? 409 : 400, { failed: true, code, values });
}
async function operation(
  event: Parameters<NonNullable<Actions[string]>>[0],
  action: "delete" | "renew" | "cancel",
) {
  const form = await event.request.formData();
  const userId = requirePersonalUser(event.locals.sessionToken);
  try {
    executeHostedPersonalCapability(userId, "subscriptions", {
      action,
      input: { id: String(form.get("id")), expectedRevision: Number(form.get("expectedRevision")) },
      operationId: String(form.get("operationId") ?? ""),
    });
    return { saved: true };
  } catch (caught) {
    return failure(caught);
  }
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
    const input: Record<string, unknown> = {
      name: values.name,
      price: Number(values.price),
      currency: values.currency,
      billing_cycle: values.billing_cycle,
      cycle_amount: Number(values.cycle_amount),
      auto_renew: values.auto_renew === "on",
      start_date: values.start_date,
      next_payment_date: values.next_payment_date || null,
      status: values.status,
      category: values.category ?? "",
      website: values.website || null,
      logo_url: values.logo_url || null,
      reminder_days: Number(values.reminder_days),
      payment_method: values.payment_method ?? "",
      notes: values.notes ?? "",
    };
    if (!values.id && !values.next_payment_date) delete input.next_payment_date;
    try {
      executeHostedPersonalCapability(userId, "subscriptions", {
        action: values.id ? "update" : "create",
        input: values.id
          ? { id: values.id, expectedRevision: Number(values.expectedRevision), patch: input }
          : input,
        operationId: values.operationId,
      });
      return { saved: true };
    } catch (caught) {
      return failure(caught, values);
    }
  },
  delete: (event) => operation(event, "delete"),
  renew: (event) => operation(event, "renew"),
  cancel: (event) => operation(event, "cancel"),
};
