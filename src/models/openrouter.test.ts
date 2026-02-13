import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createOpenRouterProvider } from "./openrouter.js";
import { ProviderError, type StreamChunk } from "./provider.js";

// Helper: create a mock Response for fetch
function mockResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

// Helper: create a SSE stream response
function mockSSEResponse(chunks: string[], status = 200): Response {
  const sseBody = chunks.join("\n") + "\n";
  return new Response(sseBody, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("openrouter provider", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("generate", () => {
    it("sends correct headers and body", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return mockResponse({
          id: "gen-123",
          model: "openai/gpt-4o",
          choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      };

      const provider = createOpenRouterProvider("sk-test-key");
      await provider.generate({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        system: "You are helpful",
        temperature: 0.7,
        maxTokens: 100,
      });

      assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(capturedInit?.method, "POST");

      const headers = capturedInit?.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer sk-test-key");
      assert.equal(headers["X-Title"], "Geofrey");
      assert.equal(headers["HTTP-Referer"], "https://github.com/geofrey-ai");
      assert.equal(headers["Content-Type"], "application/json");

      const body = JSON.parse(capturedInit?.body as string) as Record<string, unknown>;
      assert.equal(body.model, "openai/gpt-4o");
      assert.equal(body.stream, false);
      assert.equal(body.temperature, 0.7);
      assert.equal(body.max_tokens, 100);

      const messages = body.messages as Array<{ role: string; content: string }>;
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, "system");
      assert.equal(messages[0].content, "You are helpful");
      assert.equal(messages[1].role, "user");
      assert.equal(messages[1].content, "Hi");
    });

    it("returns parsed response with usage", async () => {
      globalThis.fetch = async () => mockResponse({
        id: "gen-456",
        model: "openai/gpt-4o",
        choices: [{ message: { role: "assistant", content: "Response text" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      const provider = createOpenRouterProvider("sk-key");
      const result = await provider.generate({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "test" }],
      });

      assert.equal(result.text, "Response text");
      assert.equal(result.usage.promptTokens, 100);
      assert.equal(result.usage.completionTokens, 50);
      assert.equal(result.model, "openai/gpt-4o");
      assert.equal(result.finishReason, "stop");
    });

    it("handles empty content gracefully", async () => {
      globalThis.fetch = async () => mockResponse({
        id: "gen-789",
        model: "openai/gpt-4o",
        choices: [{ message: { role: "assistant", content: null }, finish_reason: "stop" }],
      });

      const provider = createOpenRouterProvider("sk-key");
      const result = await provider.generate({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "test" }],
      });

      assert.equal(result.text, "");
      assert.equal(result.usage.promptTokens, 0);
      assert.equal(result.usage.completionTokens, 0);
    });

    it("omits optional params when not provided", async () => {
      let capturedBody: Record<string, unknown> = {};

      globalThis.fetch = async (_input, init) => {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return mockResponse({
          id: "gen-opt",
          model: "openai/gpt-4o",
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        });
      };

      const provider = createOpenRouterProvider("sk-key");
      await provider.generate({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      });

      assert.equal(capturedBody.temperature, undefined);
      assert.equal(capturedBody.max_tokens, undefined);
      // No system message
      const messages = capturedBody.messages as Array<{ role: string }>;
      assert.equal(messages.length, 1);
      assert.equal(messages[0].role, "user");
    });

    it("maps finish_reason 'length' correctly", async () => {
      globalThis.fetch = async () => mockResponse({
        id: "gen-len",
        model: "openai/gpt-4o",
        choices: [{ message: { role: "assistant", content: "truncated" }, finish_reason: "length" }],
        usage: { prompt_tokens: 10, completion_tokens: 100 },
      });

      const provider = createOpenRouterProvider("sk-key");
      const result = await provider.generate({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "test" }],
      });

      assert.equal(result.finishReason, "length");
    });
  });

  describe("error handling", () => {
    it("throws ProviderError on 400 (non-retryable)", async () => {
      globalThis.fetch = async () => mockResponse(
        { error: { message: "Invalid model" } },
        400,
      );

      const provider = createOpenRouterProvider("sk-key");
      await assert.rejects(
        () => provider.generate({ model: "bad-model", messages: [] }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 400);
          assert.equal(err.retryable, false);
          assert.ok(err.message.includes("Invalid model"));
          return true;
        },
      );
    });

    it("throws retryable ProviderError on 429", async () => {
      globalThis.fetch = async () => mockResponse(
        { error: { message: "Rate limited" } },
        429,
        { "retry-after": "5" },
      );

      const provider = createOpenRouterProvider("sk-key");
      await assert.rejects(
        () => provider.generate({ model: "openai/gpt-4o", messages: [] }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 429);
          assert.equal(err.retryable, true);
          assert.equal(err.retryAfterMs, 5000);
          return true;
        },
      );
    });

    it("throws retryable ProviderError on 500", async () => {
      globalThis.fetch = async () => mockResponse(
        { error: { message: "Internal error" } },
        500,
      );

      const provider = createOpenRouterProvider("sk-key");
      await assert.rejects(
        () => provider.generate({ model: "openai/gpt-4o", messages: [] }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 500);
          assert.equal(err.retryable, true);
          return true;
        },
      );
    });

    it("throws retryable ProviderError on 502", async () => {
      globalThis.fetch = async () => mockResponse({}, 502);

      const provider = createOpenRouterProvider("sk-key");
      await assert.rejects(
        () => provider.generate({ model: "openai/gpt-4o", messages: [] }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 502);
          assert.equal(err.retryable, true);
          return true;
        },
      );
    });

    it("throws retryable ProviderError on 503", async () => {
      globalThis.fetch = async () => mockResponse({}, 503);

      const provider = createOpenRouterProvider("sk-key");
      await assert.rejects(
        () => provider.generate({ model: "openai/gpt-4o", messages: [] }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 503);
          assert.equal(err.retryable, true);
          return true;
        },
      );
    });

    it("handles non-JSON error body gracefully", async () => {
      globalThis.fetch = async () => new Response("Gateway Timeout", {
        status: 504,
        statusText: "Gateway Timeout",
      });

      const provider = createOpenRouterProvider("sk-key");
      await assert.rejects(
        () => provider.generate({ model: "openai/gpt-4o", messages: [] }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 504);
          assert.ok(err.message.includes("504"));
          return true;
        },
      );
    });
  });

  describe("stream", () => {
    it("yields text chunks from SSE events", async () => {
      globalThis.fetch = async () => mockSSEResponse([
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}',
        "data: [DONE]",
      ]);

      const provider = createOpenRouterProvider("sk-key");
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      })) {
        chunks.push(chunk);
      }

      assert.ok(chunks.length >= 3);
      const textChunks = chunks.filter((c) => c.text !== "");
      assert.equal(textChunks[0].text, "Hello");
      assert.equal(textChunks[0].done, false);
      assert.equal(textChunks[1].text, " world");
      assert.equal(textChunks[1].done, false);
      assert.equal(textChunks[2].text, "!");
    });

    it("handles empty content deltas", async () => {
      globalThis.fetch = async () => mockSSEResponse([
        'data: {"choices":[{"delta":{"content":""},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":"text"},"finish_reason":null}]}',
        "data: [DONE]",
      ]);

      const provider = createOpenRouterProvider("sk-key");
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c.text !== "");
      assert.equal(textChunks.length, 1);
      assert.equal(textChunks[0].text, "text");
    });

    it("throws on stream error response", async () => {
      globalThis.fetch = async () => mockResponse(
        { error: { message: "No credits" } },
        402,
      );

      const provider = createOpenRouterProvider("sk-key");

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.stream({
            model: "openai/gpt-4o",
            messages: [{ role: "user", content: "Hi" }],
          })) {
            // Should not reach here
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 402);
          return true;
        },
      );
    });
  });

  describe("getModelInfo", () => {
    it("returns info for known models", () => {
      const provider = createOpenRouterProvider("sk-key");
      const info = provider.getModelInfo("openai/gpt-4o");

      assert.ok(info);
      assert.equal(info.id, "openai/gpt-4o");
      assert.equal(info.name, "GPT-4o");
      assert.equal(info.provider, "openai");
      assert.equal(info.contextLength, 128_000);
      assert.ok(info.inputCostPer1k !== undefined);
      assert.ok(info.outputCostPer1k !== undefined);
    });

    it("returns info for Claude model", () => {
      const provider = createOpenRouterProvider("sk-key");
      const info = provider.getModelInfo("anthropic/claude-sonnet-4-5-20250929");

      assert.ok(info);
      assert.equal(info.provider, "anthropic");
      assert.equal(info.contextLength, 200_000);
    });

    it("returns undefined for unknown models", () => {
      const provider = createOpenRouterProvider("sk-key");
      const info = provider.getModelInfo("some-unknown/model");

      assert.equal(info, undefined);
    });
  });
});
