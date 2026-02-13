import { z } from "zod";
import { randomUUID } from "node:crypto";
import { registerTool } from "./tool-registry.js";
import { createWebhookRouter, type WebhookRouter, type WebhookEntry } from "../webhooks/router.js";
import { createWebhookHandler, type WebhookHandler, type WebhookExecutor } from "../webhooks/handler.js";
import { t } from "../i18n/index.js";

let router: WebhookRouter | null = null;
let handler: WebhookHandler | null = null;
let webhookPort = 3002;
let webhookHost = "localhost";

export function initWebhookTool(opts: {
  executor: WebhookExecutor;
  port?: number;
  host?: string;
  existingRouter?: WebhookRouter;
}): { router: WebhookRouter; handler: WebhookHandler } {
  router = opts.existingRouter ?? createWebhookRouter();
  handler = createWebhookHandler(opts.executor);
  if (opts.port) webhookPort = opts.port;
  if (opts.host) webhookHost = opts.host;
  return { router, handler };
}

export function getWebhookRouter(): WebhookRouter | null {
  return router;
}

export function getWebhookHandler(): WebhookHandler | null {
  return handler;
}

function formatWebhook(wh: WebhookEntry): string {
  const status = wh.enabled ? "enabled" : "disabled";
  const url = `http://${webhookHost}:${webhookPort}${wh.path}`;
  const tpl = wh.template ?? "generic";
  const secret = wh.secret ? "yes" : "no";
  return `[${wh.id}] "${wh.name}" url=${url} template=${tpl} secret=${secret} chat=${wh.chatId} ${status}`;
}

registerTool({
  name: "webhook",
  description: "Manage webhook triggers: create, list, delete, or test webhooks. Webhooks receive HTTP POST requests and trigger agent actions.",
  parameters: z.object({
    action: z.enum(["create", "list", "delete", "test"]),
    name: z.string().optional().describe("Webhook name (required for create)"),
    template: z.enum(["github", "stripe", "generic"]).optional().describe("Event template for parsing"),
    secret: z.string().optional().describe("HMAC-SHA256 secret for authentication"),
    webhookId: z.string().optional().describe("Webhook ID (required for delete/test)"),
    chatId: z.string().optional().describe("Chat ID to send events to"),
  }),
  source: "native",
  execute: async ({ action, name, template, secret, webhookId, chatId }) => {
    if (!router || !handler) {
      return t("tools.notInitialized", { name: "webhook" });
    }

    switch (action) {
      case "create": {
        if (!name) return t("tools.paramRequired", { param: "name", action: "create" });

        const id = randomUUID();
        const path = `/webhook/${id}`;
        const entry: WebhookEntry = {
          id,
          name,
          path,
          secret: secret ?? null,
          template: template ?? null,
          enabled: true,
          chatId: chatId ?? "default",
        };

        router.register(entry);
        const url = `http://${webhookHost}:${webhookPort}${path}`;
        return `${t("webhook.created", { id })}\n${formatWebhook(entry)}\nURL: ${url}`;
      }

      case "list": {
        const webhooks = router.listAll();
        if (webhooks.length === 0) return t("webhook.listEmpty");
        const header = t("webhook.listHeader", { count: String(webhooks.length) });
        const lines = webhooks.map(formatWebhook);
        return `${header}\n${lines.join("\n")}`;
      }

      case "delete": {
        if (!webhookId) return t("tools.paramRequired", { param: "webhookId", action: "delete" });
        const all = router.listAll();
        const exists = all.some((wh) => wh.id === webhookId);
        if (!exists) return t("webhook.notFound");
        router.unregister(webhookId);
        return t("webhook.deleted", { id: webhookId });
      }

      case "test": {
        if (!webhookId) return t("tools.paramRequired", { param: "webhookId", action: "test" });
        const all = router.listAll();
        const webhook = all.find((wh) => wh.id === webhookId);
        if (!webhook) return t("webhook.notFound");

        const mockPayload: Record<string, unknown> = getMockPayload(webhook.template);
        const mockHeaders: Record<string, string> = getMockHeaders(webhook.template);

        const result = await handler.handle(webhook, mockPayload, mockHeaders);
        return t("webhook.testResult", { status: result.status, message: result.message });
      }
    }
  },
});

function getMockPayload(template: string | null): Record<string, unknown> {
  switch (template) {
    case "github":
      return {
        action: "opened",
        repository: { full_name: "user/test-repo" },
        sender: { login: "test-user" },
        pull_request: { title: "Test PR", number: 1 },
      };
    case "stripe":
      return {
        type: "payment_intent.succeeded",
        data: {
          object: {
            amount: 2000,
            currency: "usd",
            status: "succeeded",
            customer: "cus_test123",
          },
        },
      };
    default:
      return { event: "test", timestamp: new Date().toISOString(), data: { message: "Test webhook event" } };
  }
}

function getMockHeaders(template: string | null): Record<string, string> {
  switch (template) {
    case "github":
      return { "x-github-event": "pull_request", "x-github-delivery": "test-delivery-id" };
    case "stripe":
      return { "stripe-signature": "test" };
    default:
      return {};
  }
}
