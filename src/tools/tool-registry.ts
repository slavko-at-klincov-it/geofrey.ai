import { z, type ZodSchema } from "zod";

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
