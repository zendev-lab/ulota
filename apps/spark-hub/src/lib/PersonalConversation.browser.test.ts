import { render } from "vitest-browser-svelte";
import { afterEach, expect, it, vi } from "vitest";
import { getHubDictionary } from "@zendev-lab/spark-i18n/hub";
const mocks = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }), deserialize: JSON.parse }));
vi.mock("$app/navigation", () => ({ invalidateAll: mocks.invalidate }));
import PersonalConversation from "../routes/personal/sessions/[sessionId]/+page.svelte";
afterEach(() => {
  vi.unstubAllGlobals();
  mocks.invalidate.mockReset();
});
const messages = getHubDictionary("en");
const data = {
  messages,
  snapshot: null,
  submissionId: "submission",
  interactions: [
    {
      humanRequestId: "question",
      humanResponseId: "response",
      title: "Approve write",
      prompt: "Write the document?",
      mode: "approval",
      questions: [
        {
          id: "approval",
          prompt: "Allow this change?",
          type: "single",
          required: true,
          options: [
            { value: "approve", label: "Approve" },
            { value: "reject", label: "Reject" },
          ],
        },
      ],
    },
  ],
};

it("submits an explicit approval through the owning session action and refreshes", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "success" })));
  vi.stubGlobal("fetch", fetch);
  const screen = await render(PersonalConversation, { data: data as never, form: null });
  await screen.getByRole("combobox", { name: "Allow this change?" }).selectOptions("approve");
  await screen.getByRole("button", { name: "Send answer" }).click();
  await expect.poll(() => fetch.mock.calls.length).toBe(1);
  const [url, options] = fetch.mock.calls[0]!;
  expect(url).toBe("?/respond");
  expect(options.method).toBe("POST");
  const form = options.body as FormData;
  expect(Object.fromEntries(form)).toMatchObject({
    humanRequestId: "question",
    humanResponseId: "response",
    status: "answered",
  });
  expect(JSON.parse(String(form.get("answers")))).toMatchObject({
    approval: { values: ["approve"] },
  });
  await expect.poll(() => mocks.invalidate.mock.calls.length).toBe(1);
});

it("keeps a rejected response visible and allows retry without reporting success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "failure" }))),
  );
  const screen = await render(PersonalConversation, { data: data as never, form: null });
  await screen.getByRole("button", { name: "Cancel request" }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent(messages.personal.failure);
  await expect.element(screen.getByRole("button", { name: "Cancel request" })).toBeEnabled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
