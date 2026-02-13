/**
 * Agent management tool — provides agent_list, agent_send, agent_history
 * as a single tool with action-based dispatch.
 */

import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  formatAgentList,
  sendToAgent,
  readAgentHistory,
  listAgents,
  getAgent,
} from "../agents/communication.js";
import { listTemplates, createFromTemplate } from "../agents/agent-config.js";
import { t } from "../i18n/index.js";

registerTool({
  name: "agent_list",
  description: "List all registered agents with their status, type, model, and skills. Returns a formatted overview of the multi-agent system.",
  parameters: z.object({}),
  source: "native",
  execute: async () => {
    const result = formatAgentList();
    const templates = listTemplates();
    if (templates.length > 0) {
      return `${result}\n\n${t("agents.templates", { list: templates.join(", ") })}`;
    }
    return result;
  },
});

registerTool({
  name: "agent_send",
  description: "Send a message to a specialist agent and get its response. The message is processed by the agent's own model with its own system prompt and tools.",
  parameters: z.object({
    agentId: z.string().min(1).describe("Target agent ID (e.g., 'coder', 'researcher')"),
    message: z.string().min(1).describe("Message to send to the agent"),
    chatId: z.string().default("default").describe("Chat ID for session isolation"),
  }),
  source: "native",
  execute: async ({ agentId, message, chatId }) => {
    const agent = getAgent(agentId);
    if (!agent) {
      const available = listAgents().map((a) => a.id).join(", ");
      return t("agents.notFoundDetailed", { id: agentId, available: available || "none" });
    }

    if (!agent.enabled) {
      return t("agents.agentDisabled", { id: agentId });
    }

    const result = await sendToAgent(agentId, chatId ?? "default", message);
    return result.response;
  },
});

registerTool({
  name: "agent_history",
  description: "Read another agent's recent conversation history. Useful for understanding context or debugging agent interactions.",
  parameters: z.object({
    agentId: z.string().min(1).describe("Agent ID to read history from"),
    chatId: z.string().default("default").describe("Chat ID for session isolation"),
    count: z.coerce.number().int().positive().default(20).describe("Number of recent messages to return"),
  }),
  source: "native",
  execute: async ({ agentId, chatId, count }) => {
    return readAgentHistory(agentId, chatId ?? "default", count);
  },
});
