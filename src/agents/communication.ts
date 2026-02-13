/**
 * Agent-to-agent communication — list agents, send messages, read history.
 * Used by the hub to delegate tasks and by agents to collaborate.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agentConfigSchema,
  AGENTS_DIR,
  type AgentConfig,
} from "./agent-config.js";
import {
  ensureAgentSession,
  addAgentMessage,
  getAgentRecentHistory,
  formatAgentHistory,
} from "./session-manager.js";

/** In-memory agent registry, loaded from disk on init. */
const agents = new Map<string, AgentConfig>();

/**
 * Loads all agent configs from the agents directory.
 */
export async function loadAgents(dir?: string): Promise<AgentConfig[]> {
  agents.clear();
  const agentsDir = dir ?? AGENTS_DIR;

  let files: string[];
  try {
    files = await readdir(agentsDir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(agentsDir, file), "utf-8");
      const raw = JSON.parse(content) as unknown;
      const config = agentConfigSchema.parse(raw);
      agents.set(config.id, config);
    } catch {
      // Skip invalid agent config files
    }
  }

  return Array.from(agents.values());
}

/**
 * Registers an agent in the in-memory registry (does not persist to disk).
 */
export function registerAgent(config: AgentConfig): void {
  agents.set(config.id, config);
}

/**
 * Unregisters an agent from the in-memory registry.
 */
export function unregisterAgent(id: string): boolean {
  return agents.delete(id);
}

/**
 * Gets an agent config by ID.
 */
export function getAgent(id: string): AgentConfig | undefined {
  return agents.get(id);
}

/**
 * Lists all registered agents.
 */
export function listAgents(): AgentConfig[] {
  return Array.from(agents.values());
}

/**
 * Lists only enabled agents.
 */
export function listEnabledAgents(): AgentConfig[] {
  return Array.from(agents.values()).filter((a) => a.enabled);
}

/**
 * Gets the hub agent (there should be exactly one).
 */
export function getHubAgent(): AgentConfig | undefined {
  return Array.from(agents.values()).find((a) => a.type === "hub" && a.enabled);
}

/**
 * Gets all specialist agents.
 */
export function getSpecialistAgents(): AgentConfig[] {
  return Array.from(agents.values()).filter((a) => a.type === "specialist");
}

export interface AgentSendResult {
  agentId: string;
  response: string;
  messageCount: number;
}

/**
 * Callback type for agent execution — the hub provides this to actually
 * run the agent loop with the specialist's config.
 */
export type AgentExecutor = (
  agentId: string,
  chatId: string,
  message: string,
) => Promise<string>;

let executor: AgentExecutor | null = null;

/**
 * Sets the agent executor callback. Called once during hub initialization.
 */
export function setAgentExecutor(fn: AgentExecutor): void {
  executor = fn;
}

/**
 * Sends a message to a specialist agent and returns its response.
 * This is the core inter-agent communication primitive.
 */
export async function sendToAgent(
  agentId: string,
  chatId: string,
  message: string,
): Promise<AgentSendResult> {
  const agent = agents.get(agentId);
  if (!agent) {
    return {
      agentId,
      response: `Error: agent "${agentId}" not found`,
      messageCount: 0,
    };
  }

  if (!agent.enabled) {
    return {
      agentId,
      response: `Error: agent "${agentId}" is disabled`,
      messageCount: 0,
    };
  }

  if (!executor) {
    return {
      agentId,
      response: "Error: agent executor not configured — multi-agent routing not initialized",
      messageCount: 0,
    };
  }

  // Ensure session exists
  ensureAgentSession(agentId, chatId);

  // Record the incoming message in the agent's history
  addAgentMessage(agentId, chatId, { role: "user", content: message });

  try {
    // Execute the agent loop with the specialist's config
    const response = await executor(agentId, chatId, message);

    // Record the response in the agent's history
    addAgentMessage(agentId, chatId, { role: "assistant", content: response });

    const history = getAgentRecentHistory(agentId, chatId, 1000);
    return {
      agentId,
      response,
      messageCount: history.length,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const response = `Error from agent "${agentId}": ${errorMsg}`;

    addAgentMessage(agentId, chatId, { role: "assistant", content: response });

    return {
      agentId,
      response,
      messageCount: 0,
    };
  }
}

/**
 * Reads another agent's recent conversation history.
 */
export function readAgentHistory(
  agentId: string,
  chatId: string,
  count?: number,
): string {
  const agent = agents.get(agentId);
  if (!agent) {
    return `Error: agent "${agentId}" not found`;
  }

  return formatAgentHistory(agentId, chatId, count);
}

/**
 * Formats agent list as a readable string (for agent_list tool).
 */
export function formatAgentList(): string {
  const all = listAgents();
  if (all.length === 0) {
    return "No agents registered";
  }

  const lines = all.map((a) => {
    const status = a.enabled ? "enabled" : "disabled";
    const skills = a.skills.length > 0 ? ` skills=[${a.skills.join(", ")}]` : "";
    const tools = a.allowedTools.length > 0 ? ` tools=${a.allowedTools.length}` : "";
    return `[${a.id}] "${a.name}" type=${a.type} model=${a.modelId} memory=${a.memoryScope} ${status}${skills}${tools}`;
  });

  return `${all.length} agents:\n${lines.join("\n")}`;
}

/**
 * Resets the agent registry (for testing).
 */
export function _resetAgents(): void {
  agents.clear();
  executor = null;
}
