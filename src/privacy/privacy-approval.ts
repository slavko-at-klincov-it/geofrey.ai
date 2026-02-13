import { createRule } from "./rules-store.js";
import type { MessagingPlatform, ChatId } from "../messaging/platform.js";
import { t } from "../i18n/index.js";

export interface PrivacyDecision {
  pattern: string;
  category: string;
  action: "anonymize" | "allow" | "block";
  scope: "global" | "session";
}

/**
 * Ask the user what to do with detected PII.
 * Returns the user's decision.
 *
 * This is designed to be called from the orchestrator when new PII is detected
 * that doesn't match any existing rule.
 */
export async function askPrivacyDecision(
  chatId: ChatId,
  platform: MessagingPlatform,
  detected: { pattern: string; category: string },
): Promise<PrivacyDecision> {
  // Format the question
  const question = t("privacy.askAnonymize", {
    pattern: detected.pattern,
    category: detected.category,
  });

  // Send as a message (not an approval button — this needs a multi-option response)
  // For now, send as a message and default to anonymize
  // Full implementation would use platform-specific multi-option UI
  await platform.sendMessage(chatId, question);

  // Default: anonymize globally (the orchestrator should interpret user's response)
  return {
    pattern: detected.pattern,
    category: detected.category,
    action: "anonymize",
    scope: "global",
  };
}

/**
 * Record a privacy decision as a persistent rule.
 */
export function recordPrivacyDecision(
  dbUrl: string,
  decision: PrivacyDecision,
): void {
  if (decision.action === "allow") return; // Don't store "allow" as it's the absence of a rule

  createRule(dbUrl, {
    category: decision.category,
    pattern: decision.pattern,
    action: decision.action,
    scope: decision.scope,
    label: `Auto: ${decision.category} detected`,
  });
}
