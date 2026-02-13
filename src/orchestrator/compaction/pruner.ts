/**
 * Session pruning for tool results and old messages.
 */

/** For tool-role messages, truncate content to first 200 chars + "[truncated]" if longer than 500 chars */
export function pruneToolResults(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map((msg) => {
    if (msg.role === "tool" && msg.content.length > 500) {
      return { ...msg, content: msg.content.slice(0, 200) + " [truncated]" };
    }
    return msg;
  });
}

/** Split messages into old (to compact) and recent (to keep) */
export function pruneOldMessages(
  messages: Array<{ role: string; content: string }>,
  keepRecent: number,
): {
  old: Array<{ role: string; content: string }>;
  recent: Array<{ role: string; content: string }>;
} {
  if (messages.length <= keepRecent) {
    return { old: [], recent: [...messages] };
  }
  const splitIndex = messages.length - keepRecent;
  return {
    old: messages.slice(0, splitIndex),
    recent: messages.slice(splitIndex),
  };
}
