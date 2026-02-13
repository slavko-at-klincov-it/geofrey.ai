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

function nested(parent: unknown, key: string): unknown {
  if (typeof parent === "object" && parent !== null && !Array.isArray(parent)) {
    return (parent as Record<string, unknown>)[key];
  }
  return undefined;
}

function formatGitHubEvent(body: Record<string, unknown>, headers: Record<string, string>): string {
  const eventType = headers["x-github-event"] ?? "unknown";
  const action = typeof body.action === "string" ? body.action : undefined;
  const repo = nested(body.repository, "full_name");
  const sender = nested(body.sender, "login");

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
  } else if (eventType === "pull_request") {
    const prTitle = nested(body.pull_request, "title");
    const prNumber = nested(body.pull_request, "number");
    if (typeof prTitle === "string") parts.push(`Title: ${prTitle}`);
    if (typeof prNumber === "number") parts.push(`#${prNumber}`);
  } else if (eventType === "issues") {
    const issueTitle = nested(body.issue, "title");
    const issueNumber = nested(body.issue, "number");
    if (typeof issueTitle === "string") parts.push(`Title: ${issueTitle}`);
    if (typeof issueNumber === "number") parts.push(`#${issueNumber}`);
  }

  return parts.join("\n");
}

function formatStripeEvent(body: Record<string, unknown>): string {
  const eventType = typeof body.type === "string" ? body.type : "unknown";

  const parts: string[] = [
    "Webhook event received (Stripe)",
    `Event: ${eventType}`,
  ];

  const dataObj = nested(body.data, "object");
  if (dataObj !== undefined && typeof dataObj === "object" && dataObj !== null) {
    const stripeObj = dataObj as Record<string, unknown>;
    const amount = stripeObj.amount;
    if (typeof amount === "number") {
      const currency = typeof stripeObj.currency === "string" ? stripeObj.currency.toUpperCase() : "???";
      parts.push(`Amount: ${(amount / 100).toFixed(2)} ${currency}`);
    }
    if (typeof stripeObj.status === "string") {
      parts.push(`Status: ${stripeObj.status}`);
    }
    if (typeof stripeObj.customer === "string") {
      parts.push(`Customer: ${stripeObj.customer}`);
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
