/**
 * Hub router — receives all user messages, classifies intent,
 * and delegates to specialist agents via hub-and-spoke routing.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type AgentConfig,
  type RoutingStrategy,
  AGENTS_DIR,
  DEFAULT_HUB_CONFIG,
  agentConfigSchema,
  createFromTemplate,
  listTemplates,
} from "./agent-config.js";
import {
  loadAgents,
  registerAgent,
  unregisterAgent,
  getAgent,
  getHubAgent,
  listEnabledAgents,
  getSpecialistAgents,
  setAgentExecutor,
  sendToAgent,
  type AgentExecutor,
} from "./communication.js";
import { ensureAgentSession, addAgentMessage, getAgentRecentHistory } from "./session-manager.js";

const EXPLICIT_MENTION_REGEX = /^@([a-z0-9-]+)\s+/i;

export interface HubConfig {
  agentsDir?: string;
  routingStrategy?: RoutingStrategy;
}

export interface HubRouter {
  /** Initialize hub: load agents, create defaults if needed, set executor. */
  init(executor: AgentExecutor): Promise<void>;
  /** Route a user message to the appropriate agent and return the response. */
  route(chatId: string, userMessage: string): Promise<HubRouteResult>;
  /** Save an agent config to disk. */
  saveAgent(config: AgentConfig): Promise<void>;
  /** Delete an agent config from disk and registry. */
  deleteAgent(agentId: string): Promise<boolean>;
  /** Create an agent from a built-in template. */
  createAgentFromTemplate(templateName: string, id?: string): Promise<AgentConfig | undefined>;
  /** Get the current routing strategy. */
  getRoutingStrategy(): RoutingStrategy;
  /** Check if multi-agent routing is active. */
  isActive(): boolean;
}

export interface HubRouteResult {
  agentId: string;
  response: string;
  routingReason: string;
}

/**
 * Skill-based routing: match user message keywords against agent skills.
 * Returns the best-matching specialist agent or undefined.
 */
function skillBasedRoute(
  message: string,
  specialists: AgentConfig[],
): AgentConfig | undefined {
  const lowerMsg = message.toLowerCase();
  let bestAgent: AgentConfig | undefined;
  let bestScore = 0;

  for (const agent of specialists) {
    if (!agent.enabled) continue;
    let score = 0;

    for (const skill of agent.skills) {
      if (lowerMsg.includes(skill.toLowerCase())) {
        score++;
      }
    }

    // Also check agent name and description keywords
    if (lowerMsg.includes(agent.name.toLowerCase())) {
      score += 2;
    }

    const descWords = agent.description.toLowerCase().split(/\s+/);
    for (const word of descWords) {
      if (word.length > 4 && lowerMsg.includes(word)) {
        score += 0.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestScore > 0 ? bestAgent : undefined;
}

/**
 * Intent-based routing: use simple keyword heuristics for intent classification.
 * Maps common intents to agent types.
 */
function intentBasedRoute(
  message: string,
  specialists: AgentConfig[],
): AgentConfig | undefined {
  const lower = message.toLowerCase();

  // Coding intent signals
  const codingSignals = [
    "fix", "bug", "code", "refactor", "implement", "feature", "test",
    "function", "class", "file", "import", "error", "exception", "debug",
    "commit", "merge", "pull request", "pr", "diff", "compile", "build",
  ];

  // Research intent signals
  const researchSignals = [
    "search", "find", "look up", "what is", "who is", "how to",
    "research", "summarize", "article", "news", "latest", "current",
    "url", "website", "link", "source", "information",
  ];

  // Scheduling intent signals
  const schedulingSignals = [
    "remind", "schedule", "timer", "alarm", "cron", "every day",
    "tomorrow", "next week", "in 5 minutes", "recurring", "at ",
  ];

  // Smart home intent signals
  const homeSignals = [
    "light", "lamp", "switch", "temperature", "thermostat", "device",
    "scene", "routine", "hue", "homeassistant", "sonos", "music",
  ];

  const intentScores = new Map<string, number>();

  for (const signal of codingSignals) {
    if (lower.includes(signal)) {
      intentScores.set("coder", (intentScores.get("coder") ?? 0) + 1);
    }
  }
  for (const signal of researchSignals) {
    if (lower.includes(signal)) {
      intentScores.set("researcher", (intentScores.get("researcher") ?? 0) + 1);
    }
  }
  for (const signal of schedulingSignals) {
    if (lower.includes(signal)) {
      intentScores.set("scheduler", (intentScores.get("scheduler") ?? 0) + 1);
    }
  }
  for (const signal of homeSignals) {
    if (lower.includes(signal)) {
      intentScores.set("home", (intentScores.get("home") ?? 0) + 1);
    }
  }

  // Find the highest-scoring intent
  let bestIntent: string | undefined;
  let bestScore = 0;
  for (const [intent, score] of intentScores) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  if (!bestIntent || bestScore === 0) return undefined;

  // Find specialist matching the intent
  return specialists.find((a) => a.id === bestIntent && a.enabled);
}

/**
 * Explicit routing: detect @agent_name mention at start of message.
 * Returns [agentId, cleanMessage] or undefined if no explicit mention.
 */
function detectExplicitRoute(message: string): { agentId: string; cleanMessage: string } | undefined {
  const match = EXPLICIT_MENTION_REGEX.exec(message);
  if (!match) return undefined;

  return {
    agentId: match[1].toLowerCase(),
    cleanMessage: message.slice(match[0].length).trim(),
  };
}

export function createHub(hubConfig: HubConfig = {}): HubRouter {
  const agentsDir = hubConfig.agentsDir ?? AGENTS_DIR;
  const routingStrategy = hubConfig.routingStrategy ?? "skill-based";
  let initialized = false;

  async function ensureAgentsDir(): Promise<void> {
    await mkdir(agentsDir, { recursive: true });
  }

  async function saveAgentToDisk(config: AgentConfig): Promise<void> {
    await ensureAgentsDir();
    const filePath = join(agentsDir, `${config.id}.json`);
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  }

  async function deleteAgentFromDisk(agentId: string): Promise<boolean> {
    const filePath = join(agentsDir, `${agentId}.json`);
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function init(executor: AgentExecutor): Promise<void> {
    setAgentExecutor(executor);

    // Load existing agent configs from disk
    await loadAgents(agentsDir);

    // Create default hub if none exists
    const hub = getHubAgent();
    if (!hub) {
      const hubConfig: AgentConfig = {
        ...DEFAULT_HUB_CONFIG,
        createdAt: new Date().toISOString(),
      };
      registerAgent(hubConfig);
      await saveAgentToDisk(hubConfig);
    }

    initialized = true;
  }

  function selectSpecialist(
    message: string,
    specialists: AgentConfig[],
  ): { agent: AgentConfig; reason: string } | undefined {
    if (specialists.length === 0) return undefined;

    switch (routingStrategy) {
      case "skill-based": {
        const agent = skillBasedRoute(message, specialists);
        if (agent) return { agent, reason: `skill-based match → ${agent.id}` };
        break;
      }
      case "intent-based": {
        const agent = intentBasedRoute(message, specialists);
        if (agent) return { agent, reason: `intent-based match → ${agent.id}` };
        break;
      }
      case "explicit":
        // In explicit-only mode, only @mentions route to specialists
        break;
    }

    return undefined;
  }

  async function route(chatId: string, userMessage: string): Promise<HubRouteResult> {
    // 1. Check for explicit @mention routing
    const explicit = detectExplicitRoute(userMessage);
    if (explicit) {
      const agent = getAgent(explicit.agentId);
      if (agent && agent.enabled) {
        const result = await sendToAgent(agent.id, chatId, explicit.cleanMessage);
        return {
          agentId: agent.id,
          response: result.response,
          routingReason: `explicit @${agent.id} mention`,
        };
      }
      // Agent not found — fall through to hub handling
    }

    // 2. Try automatic routing based on strategy
    const specialists = getSpecialistAgents().filter((a) => a.enabled);
    const match = selectSpecialist(userMessage, specialists);

    if (match) {
      const result = await sendToAgent(match.agent.id, chatId, userMessage);
      return {
        agentId: match.agent.id,
        response: result.response,
        routingReason: match.reason,
      };
    }

    // 3. No specialist matched — hub handles directly
    const hub = getHubAgent();
    if (hub) {
      const result = await sendToAgent(hub.id, chatId, userMessage);
      return {
        agentId: hub.id,
        response: result.response,
        routingReason: "no specialist matched — handled by hub",
      };
    }

    // 4. Fallback — no hub agent configured
    return {
      agentId: "none",
      response: "Error: no hub agent configured — run agent setup first",
      routingReason: "no hub agent found",
    };
  }

  async function saveAgent(config: AgentConfig): Promise<void> {
    registerAgent(config);
    await saveAgentToDisk(config);
  }

  async function deleteAgent(agentId: string): Promise<boolean> {
    if (agentId === "hub") {
      return false; // Cannot delete the hub agent
    }
    unregisterAgent(agentId);
    return deleteAgentFromDisk(agentId);
  }

  async function createAgentFromTemplate(
    templateName: string,
    id?: string,
  ): Promise<AgentConfig | undefined> {
    const config = createFromTemplate(templateName, id);
    if (!config) return undefined;

    registerAgent(config);
    await saveAgentToDisk(config);
    return config;
  }

  function getRoutingStrategy(): RoutingStrategy {
    return routingStrategy;
  }

  function isActive(): boolean {
    return initialized;
  }

  return {
    init,
    route,
    saveAgent,
    deleteAgent,
    createAgentFromTemplate,
    getRoutingStrategy,
    isActive,
  };
}
