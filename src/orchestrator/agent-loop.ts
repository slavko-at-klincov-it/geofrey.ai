import { generateText } from "ai";
import { createOllama } from "ai-sdk-ollama";
import type { Config } from "../config/schema.js";
import { classifyRisk, RiskLevel } from "../approval/risk-classifier.js";
import { createApproval } from "../approval/approval-gate.js";

export interface AgentLoopOptions {
  config: Config;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  tools: Record<string, unknown>;
  onApprovalNeeded?: (nonce: string, toolName: string, args: Record<string, unknown>) => Promise<void>;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<{ text: string }> {
  const { config, systemPrompt, messages } = options;

  const ollama = createOllama({ baseURL: config.ollama.baseUrl });

  // TODO: Wire up Vercel AI SDK 6 ToolLoopAgent with:
  // - tools from tool-registry
  // - needsApproval hook using classifyRisk
  // - maxSteps from config.limits.maxAgentSteps
  // - streaming support for Telegram message edits

  const result = await generateText({
    model: ollama(config.ollama.model),
    system: systemPrompt,
    messages,
    maxRetries: 2,
  });

  return result;
}
