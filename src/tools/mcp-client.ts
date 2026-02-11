// MCP Client — discovers tools from MCP servers and wraps them in our tool registry
// All MCP tools go through our risk classifier before execution

import { registerTool } from "./tool-registry.js";
import { z } from "zod";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export async function connectMcpServer(_config: McpServerConfig): Promise<void> {
  // TODO: Use @modelcontextprotocol/sdk to:
  // 1. Spawn MCP server process
  // 2. List available tools via tools/list
  // 3. Wrap each tool with registerTool() + risk classification
  // 4. Handle tool calls via tools/call

  console.log(`MCP server connection not yet implemented: ${_config.name}`);
}

export async function disconnectAll(): Promise<void> {
  // TODO: Kill MCP server processes
}
