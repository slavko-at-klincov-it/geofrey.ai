import { tool, type Tool } from "ai";
import { z, type ZodSchema } from "zod";
import { classifyDeterministic, RiskLevel } from "../approval/risk-classifier.js";

export interface ToolDefinition<T = unknown> {
  name: string;
  description: string;
  parameters: ZodSchema<T>;
  execute: (args: T) => Promise<string>;
  source: "native" | "mcp";
}

const tools = new Map<string, ToolDefinition>();

export function registerTool<T>(tool: ToolDefinition<T>): void {
  tools.set(tool.name, tool as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

export function getToolSchemas() {
  return Object.fromEntries(
    Array.from(tools.entries()).map(([name, tool]) => [
      name,
      {
        description: tool.description,
        parameters: tool.parameters,
      },
    ]),
  );
}

export function getAiSdkTools() {
  return Object.fromEntries(
    Array.from(tools.entries()).map(([name, toolDef]) => [
      name,
      tool({
        description: toolDef.description,
        inputSchema: toolDef.parameters,
        needsApproval: (input: unknown) => {
          const classification = classifyDeterministic(name, input as Record<string, unknown>);
          if (!classification) return true;
          if (classification.level === RiskLevel.L2 || classification.level === RiskLevel.L3) {
            return true;
          }
          return false;
        },
        execute: async (input: unknown) => {
          const classification = classifyDeterministic(name, input as Record<string, unknown>);
          if (classification?.level === RiskLevel.L3) {
            throw new Error(`L3: Aktion blockiert — ${classification.reason}`);
          }
          return await toolDef.execute(input);
        },
      }),
    ]),
  );
}
