import { InlineKeyboard } from "grammy";
import type { Classification } from "../approval/risk-classifier.js";

export interface ApprovalMessage {
  text: string;
  keyboard: InlineKeyboard;
}

export function formatApproval(
  nonce: string,
  toolName: string,
  args: Record<string, unknown>,
  classification: Classification,
): ApprovalMessage {
  const text = [
    `*Genehmigung erforderlich* \\[#${nonce}\\]`,
    ``,
    `*Aktion:* \`${toolName}\``,
    `*Risiko:* ${classification.level} — ${escapeMarkdown(classification.reason)}`,
    `*Details:* \`${escapeMarkdown(JSON.stringify(args).slice(0, 200))}\``,
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text("Genehmigen", `approve:${nonce}`)
    .text("Ablehnen", `deny:${nonce}`);

  return { text, keyboard };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
