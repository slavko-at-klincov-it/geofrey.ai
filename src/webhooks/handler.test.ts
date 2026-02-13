import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createWebhookHandler, type WebhookExecutor, type WebhookHandler } from "./handler.js";
import type { WebhookEntry } from "./router.js";

function makeWebhook(overrides: Partial<WebhookEntry> = {}): WebhookEntry {
  return {
    id: "wh-1",
    name: "Test",
    path: "/webhook/wh-1",
    secret: null,
    template: null,
    enabled: true,
    chatId: "chat1",
    ...overrides,
  };
}

describe("WebhookHandler", () => {
  let executorCalls: Array<{ chatId: string; message: string }>;
  let executor: WebhookExecutor;
  let handler: WebhookHandler;

  beforeEach(() => {
    executorCalls = [];
    executor = async (chatId: string, message: string) => {
      executorCalls.push({ chatId, message });
    };
    handler = createWebhookHandler(executor);
  });

  describe("generic template", () => {
    it("stringifies body as JSON", async () => {
      const result = await handler.handle(
        makeWebhook({ template: "generic" }),
        { foo: "bar", num: 42 },
        {},
      );
      assert.equal(result.status, "ok");
      assert.equal(executorCalls.length, 1);
      assert.equal(executorCalls[0].chatId, "chat1");
      assert.ok(executorCalls[0].message.includes('"foo": "bar"'));
      assert.ok(executorCalls[0].message.includes('"num": 42'));
    });

    it("uses generic template when template is null", async () => {
      const result = await handler.handle(
        makeWebhook({ template: null }),
        { key: "value" },
        {},
      );
      assert.equal(result.status, "ok");
      assert.equal(executorCalls.length, 1);
      assert.ok(executorCalls[0].message.includes('"key": "value"'));
    });

    it("truncates large payloads", async () => {
      const largeBody: Record<string, unknown> = {};
      for (let i = 0; i < 500; i++) {
        largeBody[`key_${i}`] = "x".repeat(100);
      }
      const result = await handler.handle(
        makeWebhook({ template: "generic" }),
        largeBody,
        {},
      );
      assert.equal(result.status, "ok");
      assert.ok(executorCalls[0].message.includes("truncated"));
    });
  });

  describe("github template", () => {
    it("extracts GitHub push event details", async () => {
      const body = {
        action: "completed",
        ref: "refs/heads/main",
        repository: { full_name: "user/repo" },
        sender: { login: "octocat" },
        commits: [{ id: "abc" }, { id: "def" }],
      };
      const headers = { "x-github-event": "push" };

      const result = await handler.handle(
        makeWebhook({ template: "github" }),
        body,
        headers,
      );

      assert.equal(result.status, "ok");
      assert.equal(executorCalls.length, 1);
      const msg = executorCalls[0].message;
      assert.ok(msg.includes("GitHub"));
      assert.ok(msg.includes("push"));
      assert.ok(msg.includes("user/repo"));
      assert.ok(msg.includes("octocat"));
      assert.ok(msg.includes("refs/heads/main"));
      assert.ok(msg.includes("Commits: 2"));
    });

    it("extracts GitHub pull_request event", async () => {
      const body = {
        action: "opened",
        repository: { full_name: "user/repo" },
        sender: { login: "author" },
        pull_request: { title: "Fix bug", number: 42 },
      };
      const headers = { "x-github-event": "pull_request" };

      const result = await handler.handle(
        makeWebhook({ template: "github" }),
        body,
        headers,
      );

      assert.equal(result.status, "ok");
      const msg = executorCalls[0].message;
      assert.ok(msg.includes("pull_request"));
      assert.ok(msg.includes("opened"));
      assert.ok(msg.includes("Fix bug"));
      assert.ok(msg.includes("#42"));
    });

    it("extracts GitHub issues event", async () => {
      const body = {
        action: "closed",
        repository: { full_name: "org/project" },
        sender: { login: "closer" },
        issue: { title: "Bug report", number: 99 },
      };
      const headers = { "x-github-event": "issues" };

      const result = await handler.handle(
        makeWebhook({ template: "github" }),
        body,
        headers,
      );

      assert.equal(result.status, "ok");
      const msg = executorCalls[0].message;
      assert.ok(msg.includes("issues"));
      assert.ok(msg.includes("Bug report"));
      assert.ok(msg.includes("#99"));
    });

    it("handles minimal GitHub event gracefully", async () => {
      const result = await handler.handle(
        makeWebhook({ template: "github" }),
        {},
        {},
      );
      assert.equal(result.status, "ok");
      assert.equal(executorCalls.length, 1);
      assert.ok(executorCalls[0].message.includes("GitHub"));
    });
  });

  describe("stripe template", () => {
    it("extracts Stripe payment event details", async () => {
      const body = {
        type: "payment_intent.succeeded",
        data: {
          object: {
            amount: 4999,
            currency: "eur",
            status: "succeeded",
            customer: "cus_abc123",
          },
        },
      };

      const result = await handler.handle(
        makeWebhook({ template: "stripe" }),
        body,
        {},
      );

      assert.equal(result.status, "ok");
      assert.equal(executorCalls.length, 1);
      const msg = executorCalls[0].message;
      assert.ok(msg.includes("Stripe"));
      assert.ok(msg.includes("payment_intent.succeeded"));
      assert.ok(msg.includes("49.99"));
      assert.ok(msg.includes("EUR"));
      assert.ok(msg.includes("succeeded"));
      assert.ok(msg.includes("cus_abc123"));
    });

    it("handles Stripe event without data object", async () => {
      const body = { type: "customer.created" };
      const result = await handler.handle(
        makeWebhook({ template: "stripe" }),
        body,
        {},
      );
      assert.equal(result.status, "ok");
      const msg = executorCalls[0].message;
      assert.ok(msg.includes("customer.created"));
    });
  });

  describe("executor callback", () => {
    it("calls executor with correct chatId", async () => {
      await handler.handle(
        makeWebhook({ chatId: "my-chat" }),
        { test: true },
        {},
      );
      assert.equal(executorCalls.length, 1);
      assert.equal(executorCalls[0].chatId, "my-chat");
    });

    it("returns error status when executor throws", async () => {
      const failingExecutor: WebhookExecutor = async () => {
        throw new Error("executor failure");
      };
      const failHandler = createWebhookHandler(failingExecutor);

      const result = await failHandler.handle(
        makeWebhook(),
        { data: "test" },
        {},
      );
      assert.equal(result.status, "error");
    });
  });
});
