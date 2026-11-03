import { render } from "vitest-browser-svelte";
import { expect, it, vi } from "vitest";
import { getHubDictionary } from "@zendev-lab/spark-i18n/hub";
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
import Inventory from "../routes/personal/inventory/+page.svelte";
const messages = getHubDictionary("en");
const data = {
  messages,
  locale: "en",
  filters: { searchQuery: "camera", selectedStatus: null, selectedTag: null },
  selected: undefined,
  items: [],
  allTags: ["Photo"],
  today: "2026-10-23",
  operationId: "create",
  deleteOperations: {},
  stats: {
    total_items: 0,
    total_purchase_cost: 0,
    current_asset_value: 0,
    average_daily_spending: 0,
  },
  trend: [],
};
it("exposes an empty filtered inventory and a usable editor", async () => {
  const screen = await render(Inventory, { data: data as never, form: null });
  await expect.element(screen.getByRole("searchbox")).toHaveValue("camera");
  await expect.element(screen.getByText(messages.personal.inventoryFields.empty)).toBeVisible();
  const name = screen.container.querySelector<HTMLInputElement>('input[name="name"]')!;
  name.value = "Laptop";
  name.dispatchEvent(new Event("input", { bubbles: true }));
  expect(name.value).toBe("Laptop");
  await expect
    .element(screen.getByRole("button", { name: messages.personal.save, exact: true }))
    .toBeVisible();
});
it("retains submitted values and the stale revision when a concurrent edit fails", async () => {
  const screen = await render(Inventory, {
    data: data as never,
    form: {
      failed: true,
      code: "conflict",
      values: {
        id: "camera",
        expectedRevision: "2",
        operationId: "edit",
        name: "Unsaved camera",
        tags: "Photo\nTravel",
        notes: "Keep this",
      },
    },
  });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(messages.personal.inventoryFields.conflict);
  expect(screen.container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
    "Unsaved camera",
  );
  expect(screen.container.querySelector<HTMLTextAreaElement>('textarea[name="tags"]')?.value).toBe(
    "Photo\nTravel",
  );
  expect(
    screen.container.querySelector<HTMLInputElement>('input[name="expectedRevision"]')?.value,
  ).toBe("2");
});
