import { randomUUID } from "node:crypto";
import { fail } from "@sveltejs/kit";
import { personalTodoSnapshot } from "@zendev-lab/ulota-personal-todos";
import { personalError, requirePersonalUser } from "$lib/server/personal-auth";
import {
  executeHostedPersonalCapability,
  todoRepositoryForUser,
} from "$lib/server/personal-catalog";
import type { Actions, PageServerLoad } from "./$types";
export const load: PageServerLoad = ({ locals, url }) => {
  try {
    const repository = todoRepositoryForUser(requirePersonalUser(locals.sessionToken));
    return {
      ...personalTodoSnapshot(repository, {
        search: url.searchParams.get("q") ?? "",
        status: url.searchParams.get("status") || null,
        priority: url.searchParams.get("priority")
          ? Number(url.searchParams.get("priority"))
          : null,
      }),
      allItems: repository.list(),
      selected: repository.get(url.searchParams.get("edit") ?? ""),
      operationId: randomUUID(),
      deleteOperations: Object.fromEntries(
        repository.list().map((item) => [item.id, randomUUID()]),
      ),
    };
  } catch (caught) {
    personalError(caught);
  }
};
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
      title: values.title,
      description: values.description ?? "",
      status: values.status,
      priority: Number(values.priority),
      parent_id: values.parent_id || null,
      dependencies: form.getAll("dependencies").map(String),
      due_date: values.due_date || null,
      estimated_hours: Number(values.estimated_hours),
    };
    try {
      executeHostedPersonalCapability(userId, "todos", {
        action: values.id ? "update" : "create",
        input: values.id
          ? { id: values.id, expectedRevision: Number(values.expectedRevision), patch: input }
          : input,
        operationId: values.operationId,
      });
      return { saved: true };
    } catch (caught) {
      const code =
        caught instanceof Error && "code" in caught ? String(caught.code) : "invalid_input";
      return fail(code === "conflict" ? 409 : 400, {
        failed: true,
        code,
        values,
        dependencies: input.dependencies,
      });
    }
  },
  delete: async ({ locals, request }) => {
    const form = await request.formData();
    const userId = requirePersonalUser(locals.sessionToken);
    try {
      executeHostedPersonalCapability(userId, "todos", {
        action: "delete",
        input: {
          id: String(form.get("id")),
          expectedRevision: Number(form.get("expectedRevision")),
        },
        operationId: String(form.get("operationId") ?? ""),
      });
      return { saved: true };
    } catch (caught) {
      const code =
        caught instanceof Error && "code" in caught ? String(caught.code) : "invalid_input";
      return fail(code === "conflict" ? 409 : 400, { failed: true, code });
    }
  },
};
