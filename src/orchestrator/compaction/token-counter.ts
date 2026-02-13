/**
 * Token counting utilities for context window tracking.
 * Uses approximate estimation (4 chars ~ 1 token).
 */

/** Approximate token count: ~4 characters per token */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate total tokens for a message array, including per-message overhead (~4 tokens each) */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content) + 4; // 4 tokens overhead per message for role/formatting
  }
  return total;
}

/** Return context usage as a percentage (0-100) */
export function getContextUsagePercent(
  messages: Array<{ role: string; content: string }>,
  maxContextTokens: number,
): number {
  if (maxContextTokens <= 0) return 0;
  const used = estimateMessagesTokens(messages);
  return Math.min(100, (used / maxContextTokens) * 100);
}

/** Return true if context usage exceeds threshold (default 75%) */
export function shouldCompact(
  messages: Array<{ role: string; content: string }>,
  maxContextTokens: number,
  threshold = 75,
): boolean {
  return getContextUsagePercent(messages, maxContextTokens) > threshold;
}
