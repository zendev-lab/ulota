import { render } from "vitest-browser-svelte";
import { expect, it, vi } from "vitest";
import { getHubDictionary } from "@zendev-lab/spark-i18n/hub";
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
import Todos from "../routes/personal/todos/+page.svelte";
const messages = getHubDictionary("en");
it("preserves a failed relation edit and its dependency selections", async () => {
  const screen = await render(Todos, {
    data: {
      messages,
      filters: { search: "", status: null, priority: null },
      allItems: [{ id: "parent", title: "Parent" }],
      items: [],
      selected: undefined,
      operationId: "op",
      deleteOperations: {},
      stats: {
        total_tasks: 0,
        completed_tasks: 0,
        overdue_tasks: 0,
        completed_hours: 0,
        total_estimated_hours: 0,
      },
    } as never,
    form: {
      failed: true,
      code: "invalid_relation",
      values: { title: "Unsaved task", priority: "5", parent_id: "parent" },
      dependencies: ["parent"],
    },
  });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(messages.personal.todoFields.relationFailure);
  expect(screen.container.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe(
    "Unsaved task",
  );
  expect(
    screen.container.querySelector<HTMLInputElement>('input[name="dependencies"]')?.checked,
  ).toBe(true);
  await expect
    .element(screen.getByRole("button", { name: messages.personal.save, exact: true }))
    .toBeVisible();
});
