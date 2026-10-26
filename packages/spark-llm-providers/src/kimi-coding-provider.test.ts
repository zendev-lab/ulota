import assert from "node:assert/strict";
import { test } from "vitest";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";

import { loadSparkProviderCatalog } from "./control/provider-catalog.ts";
import registerKimiCodingProvider, {
  KIMI_CODING_API_KEY_ENV,
  KIMI_CODING_BASE_URL,
  KIMI_CODING_PROVIDER_ID,
} from "./kimi-coding-provider.ts";
import { SparkProviderRegistry } from "./provider-registry.ts";

test("registers pi-ai Kimi Coding as an API-key provider", () => {
  const registry = new SparkProviderRegistry();
  registerKimiCodingProvider(registry);

  const provider = registry.getProvider(KIMI_CODING_PROVIDER_ID);
  assert.ok(provider);
  assert.equal(provider.name, KIMI_CODING_PROVIDER_ID);
  assert.equal(provider.label, "Kimi For Coding");
  assert.equal(provider.apiKey, KIMI_CODING_API_KEY_ENV);
  assert.equal(provider.baseUrl, KIMI_CODING_BASE_URL);
  assert.equal(provider.api, "openai-completions");
  assert.equal(provider.baseUrl, "https://api.kimi.com/coding/v1");
  for (const model of provider.models) {
    assert.equal(model.api, "openai-completions");
    assert.equal(model.baseUrl, provider.baseUrl);
  }
  const modelIds = provider.models.map((model) => model.id);
  assert.ok(modelIds.length > 0, "pi-ai Kimi Coding catalog must not be empty");
  assert.equal(new Set(modelIds).size, modelIds.length, "provider model ids must be unique");
});

test("bundled catalog importer loads kimi-coding without a dynamic package import", async () => {
  const { registry, outcomes } = await loadSparkProviderCatalog();
  assert.equal(registry.hasProvider(KIMI_CODING_PROVIDER_ID), true);
  assert.ok(registry.listModelsFor(KIMI_CODING_PROVIDER_ID).length > 0);
  assert.equal(
    outcomes.find(
      (outcome) => outcome.specifier === "@zendev-lab/spark-llm-providers/kimi-coding-provider",
    )?.ok,
    true,
  );
});

test("Kimi requests retain catalog compatibility after Spark model materialization", async () => {
  const registry = new SparkProviderRegistry();
  registerKimiCodingProvider(registry);
  const provider = registry.getProvider(KIMI_CODING_PROVIDER_ID)!;
  const model = registry.buildModel(KIMI_CODING_PROVIDER_ID, "kimi-for-coding");
  const previous: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "Previous answer" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 1,
  };
  let payload: Record<string, unknown> | undefined;
  let url: string | undefined;
  const stream = provider.streamSimple(
    model,
    {
      systemPrompt: "Follow these rules",
      messages: [previous, { role: "user", content: "Continue", timestamp: 2 }],
    },
    {
      apiKey: "test-key",
      maxTokens: 100,
      fetch: async (input, init) => {
        url = String(input);
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          'data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Done"},"finish_reason":null}]}\n\n' +
            'data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
            "data: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    },
  ) as AsyncIterable<AssistantMessageEvent>;
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  assert.equal(events.at(-1)?.type, "done");
  assert.equal(url, "https://api.kimi.com/coding/v1/chat/completions");
  assert.ok(payload);
  assert.equal(payload.max_tokens, 100);
  assert.equal("max_completion_tokens" in payload, false);
  assert.equal("store" in payload, false);
  const messages = payload.messages as Array<Record<string, unknown>>;
  assert.equal(messages[0]?.role, "system");
  assert.equal(
    messages.some((message) => message.role === "developer"),
    false,
  );
  assert.equal(messages.find((message) => message.role === "assistant")?.reasoning_content, "");
});
