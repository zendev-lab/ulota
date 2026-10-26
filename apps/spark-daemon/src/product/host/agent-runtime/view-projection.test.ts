import type { ToolResultMessage } from "@zendev-lab/spark-llm-providers";
import { describe, expect, it } from "vitest";

import { toolResultToMessageView } from "./view-projection.ts";

describe("tool result view projection", () => {
  it("preserves preview presentation metadata on the tool-result part", () => {
    const message: ToolResultMessage = {
      role: "toolResult",
      toolName: "artifact",
      toolCallId: "open-preview",
      content: [{ type: "text", text: "Preview ready" }],
      isError: false,
      timestamp: 0,
      details: {
        action: "open_preview",
        preview: {
          target: "browser",
          format: "a2ui",
          supported: true,
          url: "http://127.0.0.1:4321/preview/token",
        },
      },
    };

    const view = toolResultToMessageView(message);

    expect(view.parts?.[0]?.metadata.preview).toMatchObject({
      target: "browser",
      format: "a2ui",
      supported: true,
    });
  });

  it("keeps ordinary tool-result parts free of presentation metadata", () => {
    const message: ToolResultMessage = {
      role: "toolResult",
      toolName: "read",
      toolCallId: "read-file",
      content: [{ type: "text", text: "plain output" }],
      isError: false,
      timestamp: 0,
    };

    expect(toolResultToMessageView(message).parts?.[0]?.metadata).toEqual({});
  });
});
