import type { WebhookEntry } from "./router.js";

export interface WebhookResult {
  status: "ok" | "error";
  message: string;
}

export type WebhookExecutor = (chatId: string, message: string) => Promise<void>;

export interface WebhookHandler {
  handle(
    webhook: WebhookEntry,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<WebhookResult>;
}

function formatGitHubEvent(body: Record<string, unknown>, headers: Record<string, string>): string {
  const eventType = headers["x-github-event"] ?? "unknown";
  const action = typeof body.action === "string" ? body.action : undefined;
  const repo = typeof body.repository === "object" && body.repository !== null
    ? (body.repository as Record<string, unknown>).full_name
    : undefined;
  const sender = typeof body.sender === "object" && body.sender !== null
    ? (body.sender as Record<string, unknown>).login
    : undefined;

  const parts: string[] = [
    "Webhook event received (GitHub)",
    `Event: ${eventType}`,
  ];
  if (action) parts.push(`Action: ${action}`);
  if (repo) parts.push(`Repository: ${String(repo)}`);
  if (sender) parts.push(`Sender: ${String(sender)}`);

  // Extract relevant details based on event type
  if (eventType === "push" && typeof body.ref === "string") {
    parts.push(`Ref: ${body.ref}`);
    if (Array.isArray(body.commits)) {
      parts.push(`Commits: ${body.commits.length}`);
    }
  } else if (eventType === "pull_request" && typeof body.pull_request === "object" && body.pull_request !== null) {
    const pr = body.pull_request as Record<string, unknown>;
    if (typeof pr.title === "string") parts.push(`Title: ${pr.title}`);
    if (typeof pr.number === "number") parts.push(`#${pr.number}`);
  } else if (eventType === "issues" && typeof body.issue === "object" && body.issue !== null) {
    const issue = body.issue as Record<string, unknown>;
    if (typeof issue.title === "string") parts.push(`Title: ${issue.title}`);
    if (typeof issue.number === "number") parts.push(`#${issue.number}`);
  }

  return parts.join("\n");
}

function formatStripeEvent(body: Record<string, unknown>): string {
  const eventType = typeof body.type === "string" ? body.type : "unknown";

  const parts: string[] = [
    "Webhook event received (Stripe)",
    `Event: ${eventType}`,
  ];

  if (typeof body.data === "object" && body.data !== null) {
    const data = body.data as Record<string, unknown>;
    if (typeof data.object === "object" && data.object !== null) {
      const obj = data.object as Record<string, unknown>;
      if (typeof obj.amount === "number") {
        const currency = typeof obj.currency === "string" ? obj.currency.toUpperCase() : "???";
        parts.push(`Amount: ${(obj.amount / 100).toFixed(2)} ${currency}`);
      }
      if (typeof obj.status === "string") {
        parts.push(`Status: ${obj.status}`);
      }
      if (typeof obj.customer === "string") {
        parts.push(`Customer: ${obj.customer}`);
      }
    }
  }

  return parts.join("\n");
}

function formatGenericEvent(body: Record<string, unknown>): string {
  const parts: string[] = [
    "Webhook event received",
  ];
  const json = JSON.stringify(body, null, 2);
  // Truncate large payloads
  if (json.length > 2000) {
    parts.push(json.slice(0, 2000) + "\n...(truncated)");
  } else {
    parts.push(json);
  }
  return parts.join("\n");
}

export function createWebhookHandler(executor: WebhookExecutor): WebhookHandler {
  async function handle(
    webhook: WebhookEntry,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    let message: string;

    try {
      switch (webhook.template) {
        case "github":
          message = formatGitHubEvent(body, headers);
          break;
        case "stripe":
          message = formatStripeEvent(body);
          break;
        case "generic":
        default:
          message = formatGenericEvent(body);
          break;
      }
    } catch {
      return { status: "error", message: "Failed to format webhook event" };
    }

    try {
      // Wrap in DATA boundary tags to prevent prompt injection from webhook payloads
      const safeMessage = `<webhook_data>${message}</webhook_data>`;
      await executor(webhook.chatId, safeMessage);
      return { status: "ok", message: "Webhook event delivered" };
    } catch {
      return { status: "error", message: "Failed to deliver webhook event" };
    }
  }

  return { handle };
}
