import { render } from "vitest-browser-svelte";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { getHubDictionary } from "@zendev-lab/spark-i18n/hub";
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
import PersonalHome from "../routes/personal/+page.svelte";
const messages = getHubDictionary("en");
it("keeps disabled tools closed and exposes the explicit local account choice", async () => {
  const screen = await render(PersonalHome, {
    data: { messages, signedIn: false, localSignIn: true } as never,
    form: null,
  });
  await expect.element(screen.getByRole("link", { name: "Sign in to your Hub" })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Use this local Hub account" }))
    .toBeVisible();
  expect(screen.container.querySelector('a[href="/personal/inventory"]')).toBeNull();
});
it("shows enablement, pending pairing and recoverable failure without revealing device secrets", async () => {
  const screen = await render(PersonalHome, {
    data: {
      messages,
      signedIn: true,
      installed: ["inventory"],
      enabled: [],
      bindings: [{ id: "binding", runtimeId: "device", localOwnerId: null, revokedAt: null }],
      daemons: [{ id: "device", name: "Laptop" }],
      grants: [],
      conversations: [],
      sessionOptions: [],
      newSessionId: "new",
    } as never,
    form: { failed: true },
  });
  await expect.element(screen.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
  await expect.element(screen.getByText("Waiting for device pairing")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Start personal conversation" }))
    .toBeDisabled();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: messages.personal.grant, exact: true }))
    .toBeDisabled();
  await expect.element(screen.getByText(messages.personal.permissionPrerequisite)).toBeVisible();
  const select = screen.getByRole("combobox").first();
  await select.click();
  await userEvent.keyboard("{Escape}");
  expect(screen.container.querySelector('input[name="token"]')).toBeNull();
});
