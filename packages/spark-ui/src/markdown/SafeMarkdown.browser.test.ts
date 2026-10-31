/// <reference types="vite/client" />
import axe from "axe-core";
import { render } from "vitest-browser-svelte";
import { expect, test } from "vitest";
import "../tokens.css";
import SafeMarkdown from "./SafeMarkdown.svelte";

test("loads code, math and diagram renderers for a completed response", async () => {
  const screen = await render(SafeMarkdown, {
    source: [
      "```typescript\nconst answer = 42;\n```",
      "$$x^2 + y^2 = z^2$$",
      "```mermaid\ngraph LR\n  A[Ready] --> B[Done]\n```",
    ].join("\n\n"),
  });

  await expect
    .poll(() => screen.container.querySelector("[data-streamdown-code] pre code")?.textContent)
    .toContain("const answer = 42;");
  await expect.poll(() => screen.container.querySelector(".katex .katex-html")).not.toBeNull();
  await expect
    .poll(
      () =>
        screen.container.querySelector("[data-streamdown-mermaid] [role='img'] svg")?.textContent,
    )
    .toContain("Ready");
  await screen.unmount();
});

test.each(["light", "dark"])("keeps code readable on the %s surface", async (theme) => {
  const screen = await render(SafeMarkdown, {
    source: "```typescript\nconst answer = 42; // A readable result\n```",
  });
  screen.container.setAttribute("data-spark-theme", theme);
  try {
    await expect
      .poll(() => screen.container.querySelector("[data-streamdown-code] .th-token"))
      .not.toBeNull();
    const results = await axe.run(screen.container, {
      runOnly: { type: "rule", values: ["color-contrast"] },
    });
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ).toEqual([]);
  } finally {
    await screen.unmount();
  }
});
