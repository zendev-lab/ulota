import assert from "node:assert/strict";
import { test } from "vitest";
import { Type } from "typebox";
import {
  createProvider,
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
  getCurrentTools,
  type Model,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { piAiProviderConfig } from "./spark-provider-adapter.ts";

test("Spark normalizes legacy context before calling a native pi-ai provider", () => {
  const model: Model<"openai-completions"> = {
    id: "test",
    name: "Test",
    api: "openai-completions",
    provider: "test",
    baseUrl: "https://example.invalid",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 1024,
  };
  let captured: TranscriptContext | undefined;
  const stream = (_model: Model<"openai-completions">, context: TranscriptContext) => {
    captured = context;
    return createAssistantMessageEventStream();
  };
  const provider = createProvider({
    id: "test",
    name: "Test",
    models: [model],
    auth: { apiKey: { name: "Test key", resolve: async () => undefined } },
    api: { stream, streamSimple: stream },
  });
  const config = piAiProviderConfig(provider, { authRef: "TEST_API_KEY" });
  const tool = { name: "echo", description: "Echo", parameters: Type.Object({}) };
  config.streamSimple(model, {
    systemPrompt: "Original instructions",
    tools: [tool],
    messages: [
      { role: "user", content: "hello", timestamp: 1 },
      {
        role: "system",
        content: "More instructions",
        toolsRemoved: [{ name: "echo" }],
        timestamp: 2,
      },
    ],
  });
  assert.ok(captured);
  assert.equal(
    getCurrentSystemPrompt(captured.messages),
    "Original instructions\n\nMore instructions",
  );
  assert.deepEqual(getCurrentTools(captured.messages), []);
  assert.equal(captured.messages[1]?.role, "user");
});
