import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWebhookRouter, type WebhookEntry, type WebhookRouter } from "./router.js";
import type { IncomingMessage } from "node:http";

function makeWebhook(overrides: Partial<WebhookEntry> = {}): WebhookEntry {
  return {
    id: "wh-1",
    name: "Test Webhook",
    path: "/webhook/wh-1",
    secret: null,
    template: null,
    enabled: true,
    chatId: "chat1",
    ...overrides,
  };
}

function mockRequest(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe("WebhookRouter", () => {
  let router: WebhookRouter;

  beforeEach(() => {
    router = createWebhookRouter();
  });

  describe("register / unregister", () => {
    it("registers a webhook and finds it by path", () => {
      const wh = makeWebhook();
      router.register(wh);
      const found = router.match("/webhook/wh-1");
      assert.ok(found);
      assert.equal(found.id, "wh-1");
      assert.equal(found.name, "Test Webhook");
    });

    it("unregisters a webhook", () => {
      const wh = makeWebhook();
      router.register(wh);
      router.unregister("wh-1");
      const found = router.match("/webhook/wh-1");
      assert.equal(found, undefined);
    });

    it("listAll returns all registered webhooks", () => {
      router.register(makeWebhook({ id: "a", path: "/webhook/a" }));
      router.register(makeWebhook({ id: "b", path: "/webhook/b" }));
      const all = router.listAll();
      assert.equal(all.length, 2);
    });
  });

  describe("match", () => {
    it("returns undefined for unknown path", () => {
      const found = router.match("/webhook/unknown");
      assert.equal(found, undefined);
    });

    it("does not match disabled webhooks", () => {
      router.register(makeWebhook({ enabled: false }));
      const found = router.match("/webhook/wh-1");
      assert.equal(found, undefined);
    });

    it("matches exact path", () => {
      router.register(makeWebhook());
      assert.ok(router.match("/webhook/wh-1"));
      assert.equal(router.match("/webhook/wh-1/extra"), undefined);
      assert.equal(router.match("/webhook"), undefined);
    });
  });

  describe("authenticate", () => {
    it("returns true when webhook has no secret", () => {
      const wh = makeWebhook({ secret: null });
      const req = mockRequest();
      assert.equal(router.authenticate(wh, req, "body"), true);
    });

    it("validates X-Hub-Signature-256 header (GitHub style)", () => {
      const secret = "my-secret";
      const body = '{"action":"opened"}';
      const hmac = createHmac("sha256", secret).update(body).digest("hex");
      const sig = `sha256=${hmac}`;

      const wh = makeWebhook({ secret });
      const req = mockRequest({ "x-hub-signature-256": sig });
      assert.equal(router.authenticate(wh, req, body), true);
    });

    it("rejects invalid X-Hub-Signature-256", () => {
      const wh = makeWebhook({ secret: "my-secret" });
      const req = mockRequest({ "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000" });
      assert.equal(router.authenticate(wh, req, "body"), false);
    });

    it("validates X-Webhook-Secret header (direct match)", () => {
      const secret = "direct-secret";
      const wh = makeWebhook({ secret });
      const req = mockRequest({ "x-webhook-secret": secret });
      assert.equal(router.authenticate(wh, req, "body"), true);
    });

    it("rejects incorrect X-Webhook-Secret", () => {
      const wh = makeWebhook({ secret: "correct-secret" });
      const req = mockRequest({ "x-webhook-secret": "wrong-secret!" });
      assert.equal(router.authenticate(wh, req, "body"), false);
    });

    it("rejects when secret is set but no auth header present", () => {
      const wh = makeWebhook({ secret: "my-secret" });
      const req = mockRequest();
      assert.equal(router.authenticate(wh, req, "body"), false);
    });

    it("rejects signature with wrong length", () => {
      const wh = makeWebhook({ secret: "my-secret" });
      const req = mockRequest({ "x-hub-signature-256": "sha256=short" });
      assert.equal(router.authenticate(wh, req, "body"), false);
    });
  });

  describe("rate limiting", () => {
    it("allows requests within limit", () => {
      router = createWebhookRouter(3);
      assert.equal(router.checkRateLimit("wh-1"), true);
      assert.equal(router.checkRateLimit("wh-1"), true);
      assert.equal(router.checkRateLimit("wh-1"), true);
    });

    it("blocks requests exceeding limit", () => {
      router = createWebhookRouter(2);
      assert.equal(router.checkRateLimit("wh-1"), true);
      assert.equal(router.checkRateLimit("wh-1"), true);
      assert.equal(router.checkRateLimit("wh-1"), false);
    });

    it("tracks rate limits per webhook independently", () => {
      router = createWebhookRouter(1);
      assert.equal(router.checkRateLimit("wh-1"), true);
      assert.equal(router.checkRateLimit("wh-1"), false);
      // Different webhook should still be allowed
      assert.equal(router.checkRateLimit("wh-2"), true);
    });

    it("resets after unregister", () => {
      router = createWebhookRouter(1);
      router.register(makeWebhook());
      assert.equal(router.checkRateLimit("wh-1"), true);
      assert.equal(router.checkRateLimit("wh-1"), false);

      router.unregister("wh-1");
      // After unregister, rate limit state is cleared
      assert.equal(router.checkRateLimit("wh-1"), true);
    });
  });
});
