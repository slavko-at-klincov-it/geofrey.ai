/**
 * Per-agent session isolation — each agent has its own conversation history.
 * Uses agentId-prefixed chatIds to keep histories separate.
 */

import {
  getOrCreate,
  addMessage,
  getHistory,
  compactMessages,
  type Message,
} from "../orchestrator/conversation.js";

/**
 * Builds a namespaced chatId for agent-specific conversations.
 * Format: "agent:{agentId}:{chatId}" — ensures isolation between agents.
 */
export function agentChatId(agentId: string, chatId: string): string {
  return `agent:${agentId}:${chatId}`;
}

/**
 * Ensures a conversation exists for the given agent + chatId.
 */
export function ensureAgentSession(agentId: string, chatId: string): void {
  getOrCreate(agentChatId(agentId, chatId));
}

/**
 * Adds a message to the agent's conversation.
 */
export function addAgentMessage(
  agentId: string,
  chatId: string,
  message: Omit<Message, "id" | "createdAt">,
): Message {
  return addMessage(agentChatId(agentId, chatId), message);
}

/**
 * Gets the full conversation history for an agent.
 */
export function getAgentHistory(agentId: string, chatId: string): Message[] {
  return getHistory(agentChatId(agentId, chatId));
}

/**
 * Gets recent messages from an agent's conversation.
 */
export function getAgentRecentHistory(
  agentId: string,
  chatId: string,
  count: number = 20,
): Message[] {
  const history = getAgentHistory(agentId, chatId);
  return history.slice(-count);
}

/**
 * Compacts an agent's conversation history with a summary.
 */
export function compactAgentHistory(
  agentId: string,
  chatId: string,
  summary: string,
): void {
  compactMessages(agentChatId(agentId, chatId), summary);
}

/**
 * Gets token count info for an agent's conversation.
 */
export function getAgentMessageCount(agentId: string, chatId: string): number {
  return getAgentHistory(agentId, chatId).length;
}

/**
 * Formats agent history as a readable string (for agent_history tool).
 */
export function formatAgentHistory(
  agentId: string,
  chatId: string,
  count: number = 20,
): string {
  const recent = getAgentRecentHistory(agentId, chatId, count);
  if (recent.length === 0) {
    return `No conversation history for agent "${agentId}"`;
  }

  const lines = recent.map((m) => {
    const ts = m.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const role = m.role.toUpperCase();
    const content = m.content.length > 500
      ? m.content.slice(0, 500) + "..."
      : m.content;
    return `[${ts}] ${role}: ${content}`;
  });

  return `Recent history for "${agentId}" (${recent.length} messages):\n${lines.join("\n")}`;
}
