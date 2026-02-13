import { App } from "@slack/bolt";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";
import { t } from "../../i18n/index.js";

interface SlackConfig {
  botToken: string;
  appToken: string;
  channelId: string;
}

/** Convert standard markdown-ish text to Slack mrkdwn. */
function toSlackMrkdwn(text: string): string {
  // Slack uses *bold* (same), _italic_ (same), `code` (same)
  // Links: <url|text> instead of [text](url)
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");
}

function formatApprovalBlocks(
  nonce: string,
  toolName: string,
  args: Record<string, unknown>,
  classification: Classification,
): { text: string; blocks: unknown[] } {
  const argsStr = JSON.stringify(args).slice(0, 200);
  const text = [
    `*${t("messaging.approvalRequired")}* [#${nonce}]`,
    ``,
    `*${t("messaging.actionLabel")}* \`${toolName}\``,
    `*${t("messaging.riskLabel")}* ${classification.level} — ${classification.reason}`,
    `*${t("messaging.detailsLabel")}* \`${argsStr}\``,
  ].join("\n");

  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
    {
      type: "actions",
      block_id: `approval_${nonce}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: t("messaging.approve") },
          style: "primary",
          action_id: `approve:${nonce}`,
          value: nonce,
        },
        {
          type: "button",
          text: { type: "plain_text", text: t("messaging.deny") },
          style: "danger",
          action_id: `deny:${nonce}`,
          value: nonce,
        },
      ],
    },
  ];

  return { text, blocks };
}

export function createSlackPlatform(
  config: SlackConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    socketMode: true,
  });

  // Handle messages in the configured channel
  app.message(async ({ message, client }) => {
    // Filter to configured channel only; ignore bot messages
    if (!("channel" in message) || message.channel !== config.channelId) return;
    if ("bot_id" in message && message.bot_id) return;
    if (!("text" in message) || !message.text) return;

    const chatId = message.channel;
    try {
      await callbacks.onMessage(chatId, message.text);
    } catch (err) {
      console.error("Slack message handler error:", err);
      await client.chat.postMessage({
        channel: chatId,
        text: t("messaging.processingError"),
      });
    }
  });

  // Handle approval button clicks
  app.action(/^approve:(.+)$/, async ({ action, ack, client, body }) => {
    await ack();
    const nonce = "action_id" in action ? action.action_id.replace("approve:", "") : "";
    await callbacks.onApprovalResponse(nonce, true);

    // Remove buttons from the message
    if ("message" in body && body.message && "ts" in body.message && "channel" in body) {
      const channel = (body as { channel: { id: string } }).channel.id;
      const ts = (body.message as { ts: string }).ts;
      const existingBlocks = (body.message as { blocks?: unknown[] }).blocks ?? [];
      // Keep only section blocks, remove actions
      const updatedBlocks = (existingBlocks as Array<{ type: string }>).filter(
        (b) => b.type !== "actions",
      );
      updatedBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `_${t("messaging.approved")}_` },
      } as unknown as { type: string });
      await client.chat.update({
        channel,
        ts,
        blocks: updatedBlocks as [],
        text: t("messaging.approved"),
      });
    }
  });

  app.action(/^deny:(.+)$/, async ({ action, ack, client, body }) => {
    await ack();
    const nonce = "action_id" in action ? action.action_id.replace("deny:", "") : "";
    await callbacks.onApprovalResponse(nonce, false);

    // Remove buttons from the message
    if ("message" in body && body.message && "ts" in body.message && "channel" in body) {
      const channel = (body as { channel: { id: string } }).channel.id;
      const ts = (body.message as { ts: string }).ts;
      const existingBlocks = (body.message as { blocks?: unknown[] }).blocks ?? [];
      const updatedBlocks = (existingBlocks as Array<{ type: string }>).filter(
        (b) => b.type !== "actions",
      );
      updatedBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `_${t("messaging.denied")}_` },
      } as unknown as { type: string });
      await client.chat.update({
        channel,
        ts,
        blocks: updatedBlocks as [],
        text: t("messaging.denied"),
      });
    }
  });

  return {
    name: "slack",
    maxMessageLength: 4000,
    supportsEdit: true,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      const result = await app.client.chat.postMessage({
        channel: chatId,
        text: toSlackMrkdwn(text),
      });
      return result.ts ?? "";
    },

    async editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      await app.client.chat.update({
        channel: chatId,
        ts: ref,
        text: toSlackMrkdwn(text),
      });
      return ref;
    },

    async sendApproval(
      chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      classification: Classification,
    ): Promise<void> {
      const { text, blocks } = formatApprovalBlocks(nonce, toolName, args, classification);
      await app.client.chat.postMessage({
        channel: chatId,
        text,
        blocks: blocks as [],
      });
    },

    async start(): Promise<void> {
      await app.start();
      console.log("Slack adapter started (Socket Mode)");
    },

    async stop(): Promise<void> {
      await app.stop();
    },
  };
}

export { formatApprovalBlocks, toSlackMrkdwn };
