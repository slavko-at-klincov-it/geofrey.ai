import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWebhookRouter, type WebhookRouter, type WebhookEntry } from "../../webhooks/router.js";
import { createWebhookHandler, type WebhookHandler, type WebhookExecutor } from "../../webhooks/handler.js";
import { startWebhookServer, type WebhookServer } from "../../webhooks/server.js";

function makeWebhook(overrides: Partial<WebhookEntry> = {}): WebhookEntry {
  return {
    id: "e2e-wh-1",
    name: "E2E Test Webhook",
    path: "/webhook/e2e-wh-1",
    secret: null,
    template: "generic",
    enabled: true,
    chatId: "chat-e2e-001",
    ...overrides,
  };
}

describe("E2E: Webhook Server", { timeout: 30_000 }, () => {
  let router: WebhookRouter;
  let handler: WebhookHandler;
  let server: WebhookServer;
  let baseUrl: string;
  let testPort: number;
  let executorCalls: Array<{ chatId: string; message: string }>;

  before(async () => {
    executorCalls = [];
    const executor: WebhookExecutor = async (chatId, message) => {
      executorCalls.push({ chatId, message });
    };
    router = createWebhookRouter();
    handler = createWebhookHandler(executor);
    testPort = 30_000 + Math.floor(Math.random() * 10_000);
    baseUrl = `http://localhost:${testPort}`;
    server = startWebhookServer({ port: testPort, router, handler });
    await server.start();
  });

  after(async () => {
    if (server) {
      await server.stop();
    }
  });

  it("webhook server starts and stops cleanly", async () => {
    // Server is already started in before() — verify it responds
    const res = await fetch(`${baseUrl}/webhook/nonexistent-startup-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });
    // Should get 404 (not connection refused), proving the server is listening
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Webhook not found");
  });

  it("registered webhook receives POST and triggers executor", async () => {
    const wh = makeWebhook();
    router.register(wh);

    const payload = { event: "deployment.completed", service: "geofrey-api", environment: "production" };
    const res = await fetch(`${baseUrl}/webhook/e2e-wh-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const responseBody = (await res.json()) as { status: string; message: string };
    assert.equal(responseBody.status, "ok");
    assert.equal(responseBody.message, "Webhook event delivered");

    // Give the async executor a moment to complete
    await new Promise((r) => setTimeout(r, 50));

    // Verify executor was called with the correct chatId
    const call = executorCalls.find((c) => c.chatId === "chat-e2e-001");
    assert.ok(call, "Executor should have been called with chatId 'chat-e2e-001'");
    assert.ok(call.message.includes("Webhook event received"), "Message should contain formatted webhook event");
    assert.ok(call.message.includes("deployment.completed"), "Message should include payload data");

    // Cleanup
    router.unregister("e2e-wh-1");
  });

  it("unregistered path returns 404", async () => {
    const res = await fetch(`${baseUrl}/webhook/nonexistent-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "should_not_arrive" }),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Webhook not found");
  });

  it("HMAC authentication rejects invalid signature", async () => {
    const secret = "e2e-geheimer-schluessel-2026";
    const wh = makeWebhook({
      id: "e2e-hmac-reject",
      path: "/webhook/e2e-hmac-reject",
      secret,
    });
    router.register(wh);

    const payload = JSON.stringify({ action: "opened", repository: { full_name: "geofrey/core" } });
    const wrongSig = "sha256=" + createHmac("sha256", "falscher-schluessel").update(payload).digest("hex");

    const res = await fetch(`${baseUrl}/webhook/e2e-hmac-reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": wrongSig,
      },
      body: payload,
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Unauthorized");

    router.unregister("e2e-hmac-reject");
  });

  it("HMAC authentication accepts valid signature", async () => {
    const secret = "e2e-korrekter-schluessel-2026";
    const wh = makeWebhook({
      id: "e2e-hmac-accept",
      path: "/webhook/e2e-hmac-accept",
      secret,
      template: "github",
      chatId: "chat-hmac-test",
    });
    router.register(wh);

    const payload = JSON.stringify({
      action: "opened",
      repository: { full_name: "geofrey-ai/geofrey" },
      sender: { login: "slavko" },
      pull_request: { title: "feat: add webhook E2E tests", number: 42 },
    });
    const correctSig = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");

    const callsBefore = executorCalls.length;

    const res = await fetch(`${baseUrl}/webhook/e2e-hmac-accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": correctSig,
        "X-GitHub-Event": "pull_request",
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const responseBody = (await res.json()) as { status: string };
    assert.equal(responseBody.status, "ok");

    // Verify executor received the GitHub-formatted event
    await new Promise((r) => setTimeout(r, 50));
    const newCalls = executorCalls.slice(callsBefore);
    assert.equal(newCalls.length, 1, "Executor should have been called exactly once");
    assert.equal(newCalls[0].chatId, "chat-hmac-test");
    assert.ok(newCalls[0].message.includes("pull_request"), "Should contain GitHub event type");
    assert.ok(newCalls[0].message.includes("geofrey-ai/geofrey"), "Should contain repository name");

    router.unregister("e2e-hmac-accept");
  });

  it("rate limiting blocks excessive requests", async () => {
    // Create a separate router with a rate limit of 2 requests per window
    const rateLimitedRouter = createWebhookRouter(2);
    const rateLimitedHandler = createWebhookHandler(async () => {});
    const rlPort = testPort + 1;
    const rlServer = startWebhookServer({
      port: rlPort,
      router: rateLimitedRouter,
      handler: rateLimitedHandler,
    });
    await rlServer.start();

    try {
      const rlBaseUrl = `http://localhost:${rlPort}`;
      rateLimitedRouter.register(makeWebhook({
        id: "e2e-ratelimit",
        path: "/webhook/e2e-ratelimit",
        chatId: "chat-ratelimit",
      }));

      const sendRequest = () =>
        fetch(`${rlBaseUrl}/webhook/e2e-ratelimit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: "rate-limit-test", zeit: new Date().toISOString() }),
        });

      // First two requests should succeed (rate limit = 2)
      const res1 = await sendRequest();
      assert.equal(res1.status, 200, "First request should succeed");

      const res2 = await sendRequest();
      assert.equal(res2.status, 200, "Second request should succeed");

      // Third request should be rate limited
      const res3 = await sendRequest();
      assert.equal(res3.status, 429, "Third request should be rate limited");
      const body3 = (await res3.json()) as { error: string };
      assert.equal(body3.error, "Rate limit exceeded");
    } finally {
      await rlServer.stop();
    }
  });
});
