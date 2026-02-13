import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startWebhookServer, type WebhookServer } from "./server.js";
import { createWebhookRouter, type WebhookRouter, type WebhookEntry } from "./router.js";
import { createWebhookHandler, type WebhookHandler, type WebhookExecutor } from "./handler.js";

function makeWebhook(overrides: Partial<WebhookEntry> = {}): WebhookEntry {
  return {
    id: "wh-1",
    name: "Test",
    path: "/webhook/wh-1",
    secret: null,
    template: "generic",
    enabled: true,
    chatId: "chat1",
    ...overrides,
  };
}

describe("WebhookServer", () => {
  let server: WebhookServer | null = null;
  let router: WebhookRouter;
  let handler: WebhookHandler;
  let executorCalls: Array<{ chatId: string; message: string }>;
  let baseUrl: string;
  let testPort: number;

  beforeEach(() => {
    executorCalls = [];
    const executor: WebhookExecutor = async (chatId, message) => {
      executorCalls.push({ chatId, message });
    };
    router = createWebhookRouter();
    handler = createWebhookHandler(executor);
    testPort = 19900 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${testPort}`;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  async function startServer(): Promise<void> {
    server = startWebhookServer({ port: testPort, router, handler });
    await server.start();
  }

  it("starts and stops without error", async () => {
    await startServer();
    await server!.stop();
    server = null;
  });

  it("returns 404 for unknown paths", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/webhook/unknown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 404 for non-POST methods", async () => {
    await startServer();
    router.register(makeWebhook());
    const res = await fetch(`${baseUrl}/webhook/wh-1`, { method: "GET" });
    assert.equal(res.status, 404);
  });

  it("routes to matching webhook and returns 200", async () => {
    await startServer();
    router.register(makeWebhook());

    const res = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "test" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json() as { status: string };
    assert.equal(data.status, "ok");

    // Executor should have been called
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(executorCalls.length, 1);
    assert.equal(executorCalls[0].chatId, "chat1");
  });

  it("returns 401 for invalid authentication", async () => {
    await startServer();
    router.register(makeWebhook({ secret: "my-secret" }));

    const res = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": "sha256=invalid",
      },
      body: JSON.stringify({ event: "test" }),
    });
    assert.equal(res.status, 401);
  });

  it("accepts valid HMAC authentication", async () => {
    await startServer();
    const secret = "test-secret";
    router.register(makeWebhook({ secret }));

    const body = JSON.stringify({ event: "authenticated" });
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    const res = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": sig,
      },
      body,
    });
    assert.equal(res.status, 200);
  });

  it("returns 429 when rate limited", async () => {
    // Create router with very low rate limit
    router = createWebhookRouter(1);
    handler = createWebhookHandler(async () => {});
    await startServer();
    router.register(makeWebhook());

    // First request should succeed
    const res1 = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n: 1 }),
    });
    assert.equal(res1.status, 200);

    // Second request should be rate limited
    const res2 = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n: 2 }),
    });
    assert.equal(res2.status, 429);
  });

  it("handles form-urlencoded body", async () => {
    await startServer();
    router.register(makeWebhook());

    const res = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "key=value&another=data",
    });
    assert.equal(res.status, 200);

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(executorCalls.length, 1);
    assert.ok(executorCalls[0].message.includes("value"));
  });

  it("returns 400 for invalid body", async () => {
    await startServer();
    router.register(makeWebhook());

    const res = await fetch(`${baseUrl}/webhook/wh-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json-at-all{{{",
    });
    assert.equal(res.status, 400);
  });
});
