/**
 * Agent definition types + Zod schema.
 * Each agent is a JSON config file stored in data/agents/.
 */

import { z } from "zod";

export const AGENTS_DIR = "data/agents";

export type RoutingStrategy = "skill-based" | "intent-based" | "explicit";
export type MemoryScope = "shared" | "isolated";
export type AgentType = "hub" | "specialist";

export const agentConfigSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with dashes"),
  name: z.string().min(1).max(100),
  type: z.enum(["hub", "specialist"]),
  description: z.string().default(""),
  systemPrompt: z.string().min(1),
  modelId: z.string().default("local"),
  allowedTools: z.array(z.string()).default([]),
  memoryScope: z.enum(["shared", "isolated"]).default("shared"),
  skills: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

/**
 * Built-in specialist templates for quick agent creation.
 */
export const SPECIALIST_TEMPLATES: ReadonlyMap<string, Omit<AgentConfig, "id" | "createdAt">> = new Map([
  ["coder", {
    name: "Coder",
    type: "specialist" as const,
    description: "Handles coding tasks: multi-file edits, bug fixes, refactoring, test writing",
    systemPrompt: `You are the Coder agent, a specialist in software development. You handle coding tasks including:
- Multi-file changes and refactoring
- Bug investigation and fixes
- Test writing and code review
- Feature implementation

Use claude_code for complex tasks. Use read_file, search, and shell_exec for investigation.
Be precise with file paths and include relevant context in your prompts.
Always explain what you changed and why.`,
    modelId: "local",
    allowedTools: ["claude_code", "read_file", "list_dir", "search", "shell_exec", "git_status", "git_diff", "git_log", "write_file"],
    memoryScope: "shared" as const,
    skills: ["coding", "debugging", "testing", "refactoring"],
    enabled: true,
  }],
  ["researcher", {
    name: "Researcher",
    type: "specialist" as const,
    description: "Handles research tasks: web search, URL fetching, information gathering",
    systemPrompt: `You are the Researcher agent, a specialist in finding and synthesizing information. You handle:
- Web searches for current information
- URL fetching and content extraction
- Summarizing findings
- Fact-checking and source comparison

Use web_search to find information. Use web_fetch to extract content from URLs.
Always cite sources and distinguish facts from opinions.
Provide concise summaries with key takeaways.`,
    modelId: "local",
    allowedTools: ["web_search", "web_fetch", "memory_read", "memory_write", "memory_search"],
    memoryScope: "shared" as const,
    skills: ["research", "search", "summarize", "fact-check"],
    enabled: true,
  }],
  ["home", {
    name: "Home",
    type: "specialist" as const,
    description: "Handles smart home automation: lights, scenes, routines, device control",
    systemPrompt: `You are the Home agent, a specialist in smart home automation. You handle:
- Light and scene control (Hue, HomeAssistant)
- Device status checks
- Routine creation and management
- Temperature and climate control

Use shell_exec for CLI-based integrations. Store routines in memory.
Confirm destructive actions (reset, factory reset) before executing.
Report device status in a human-readable format.`,
    modelId: "local",
    allowedTools: ["shell_exec", "memory_read", "memory_write", "cron"],
    memoryScope: "isolated" as const,
    skills: ["smart-home", "lights", "automation", "routines"],
    enabled: true,
  }],
  ["scheduler", {
    name: "Scheduler",
    type: "specialist" as const,
    description: "Handles scheduling: cron jobs, reminders, recurring tasks",
    systemPrompt: `You are the Scheduler agent, a specialist in time-based automation. You handle:
- Creating cron jobs and reminders
- Managing recurring tasks
- Scheduling one-time actions
- Listing and deleting scheduled items

Use the cron tool for all scheduling operations.
Confirm the schedule with the user before creating.
Use natural language to describe when tasks will run.`,
    modelId: "local",
    allowedTools: ["cron", "memory_read", "memory_write"],
    memoryScope: "shared" as const,
    skills: ["scheduling", "reminders", "cron", "timers"],
    enabled: true,
  }],
]);

/**
 * Default hub agent configuration, created on first startup if agents are enabled.
 */
export const DEFAULT_HUB_CONFIG: Omit<AgentConfig, "createdAt"> = {
  id: "hub",
  name: "Hub",
  type: "hub",
  description: "Central routing agent — receives all messages, classifies intent, delegates to specialists",
  systemPrompt: `You are the Hub agent, the central router for a multi-agent system. Your job is to:

1. Understand the user's intent
2. Route to the best specialist agent OR handle simple queries yourself
3. Return the specialist's response to the user

<routing_rules>
- Coding tasks (bugs, features, refactoring, tests) → @coder
- Research tasks (web search, information gathering) → @researcher
- Smart home tasks (lights, devices, routines) → @home
- Scheduling tasks (reminders, cron jobs, timers) → @scheduler
- Simple questions, greetings, and meta-queries → handle directly
- If unsure, ask the user to clarify
</routing_rules>

<explicit_routing>
Users can explicitly route with @agent_name prefix (e.g., "@coder fix the bug").
When you see @agent_name, always route to that agent.
</explicit_routing>

When delegating:
- Include full user context in the message to the specialist
- Do NOT modify or summarize the specialist's response — pass it through
- If a specialist fails, inform the user and offer alternatives`,
  modelId: "local",
  allowedTools: ["agent_list", "agent_send", "agent_history", "memory_read", "memory_search"],
  memoryScope: "shared",
  skills: [],
  enabled: true,
};

/**
 * Validates a raw object against the agent config schema.
 * Returns the parsed config or throws on validation failure.
 */
export function parseAgentConfig(raw: unknown): AgentConfig {
  return agentConfigSchema.parse(raw);
}

/**
 * Creates an agent config from a template with the given ID.
 * Returns undefined if the template does not exist.
 */
export function createFromTemplate(templateName: string, id?: string): AgentConfig | undefined {
  const template = SPECIALIST_TEMPLATES.get(templateName);
  if (!template) return undefined;

  return {
    ...template,
    id: id ?? templateName,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns available template names.
 */
export function listTemplates(): string[] {
  return Array.from(SPECIALIST_TEMPLATES.keys());
}
