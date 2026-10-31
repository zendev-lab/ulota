import { render } from "vitest-browser-svelte";
import { expect, it, vi } from "vitest";
import { getHubDictionary } from "@zendev-lab/spark-i18n/hub";
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
import Import from "../routes/personal/import/+page.svelte";
const messages = getHubDictionary("en");
it("requires explicit confirmation after preview and distinguishes conflicts from new records", async () => {
  const screen = await render(Import, {
    data: { messages, operationId: "initial", maximumBytes: 10485760 } as never,
    form: {
      preview: {
        entries: [
          { capability: "inventory", legacyId: "old-1", status: "create" },
          { capability: "todos", legacyId: "old-2", status: "source_changed" },
        ],
        warnings: [],
      },
      payload: '{"version":1}',
      operationId: "00000000-0000-4000-8000-000000000000",
    },
  });
  await expect
    .element(screen.getByRole("button", { name: messages.personal.importFields.confirm }))
    .toBeEnabled();
  await expect
    .element(screen.getByText(messages.personal.importFields.source_changed, { exact: false }))
    .toBeVisible();
  expect(screen.container.querySelector<HTMLInputElement>('input[name="operationId"]')?.value).toBe(
    "00000000-0000-4000-8000-000000000000",
  );
});
it("does not offer to reinsert skipped targets or claim a failed import succeeded", async () => {
  const screen = await render(Import, {
    data: { messages, operationId: "initial", maximumBytes: 10485760 } as never,
    form: { failed: true, code: "invalid_relation" },
  });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(messages.personal.importFields.relationFailure);
  expect(screen.container.querySelector('[role="status"]')).toBeNull();
  expect(screen.container.querySelector('form[action="?/commit"]')).toBeNull();
});
