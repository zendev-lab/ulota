import { render } from "vitest-browser-svelte";
import { expect, it, vi } from "vitest";
import { getHubDictionary } from "@zendev-lab/spark-i18n/hub";
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
import Subscriptions from "../routes/personal/subscriptions/+page.svelte";
const messages = getHubDictionary("en");
it("retains an unchecked renewal preference after a stale edit and separates currency rows", async () => {
  const screen = await render(Subscriptions, {
    data: {
      messages,
      locale: "en",
      filters: { search: "", status: null, currency: null, category: null },
      categories: [],
      items: [],
      today: "2026-10-23",
      operationId: "op",
      recordOperations: {},
      stats: {
        total_subscriptions: 0,
        active_subscriptions: 0,
        upcoming_payments: 0,
        byCurrency: {
          USD: { monthly_cost: 10, yearly_cost: 120, estimated_spent: 20 },
          CNY: { monthly_cost: 30, yearly_cost: 360, estimated_spent: 60 },
        },
      },
    } as never,
    form: {
      failed: true,
      code: "conflict",
      values: { name: "Unsaved", auto_renew: "", currency: "USD", notes: "Keep" },
    },
  });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(messages.personal.subscriptionFields.conflict);
  expect(
    screen.container.querySelector<HTMLInputElement>('input[name="auto_renew"]')?.checked,
  ).toBe(false);
  expect(screen.container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
    "Unsaved",
  );
  await expect.element(screen.getByRole("rowheader", { name: "USD", exact: true })).toBeVisible();
  await expect.element(screen.getByRole("rowheader", { name: "CNY", exact: true })).toBeVisible();
});
