// MCP Client — discovers tools from MCP servers and wraps them in our tool registry
// All MCP tools go through our risk classifier before execution

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { registerTool } from "./tool-registry.js";
import { z } from "zod";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  config: McpServerConfig;
}

const activeConnections = new Map<string, McpConnection>();

export async function connectMcpServer(config: McpServerConfig): Promise<void> {
  if (activeConnections.has(config.name)) {
    console.log(`MCP server already connected: ${config.name}`);
    return;
  }

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: config.env,
  });

  const client = new Client(
    {
      name: "geofrey",
      version: "0.1.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  activeConnections.set(config.name, {
    client,
    transport,
    config,
  });

  const { tools } = await client.listTools();

  for (const mcpTool of tools) {
    const toolName = `${config.name}:${mcpTool.name}`;

    registerTool({
      name: toolName,
      description: mcpTool.description ?? `Tool from MCP server ${config.name}`,
      // Use passthrough schema since we can't convert JSON Schema to Zod at runtime
      // MCP server will validate the actual schema
      parameters: z.object({}).passthrough(),
      source: "mcp",
      execute: async (args: unknown) => {
        const connection = activeConnections.get(config.name);
        if (!connection) {
          throw new Error(`MCP server not connected: ${config.name}`);
        }

        const result = await connection.client.callTool({
          name: mcpTool.name,
          arguments: args as Record<string, unknown>,
        });

        // Extract text content from result
        const content = result.content as Array<{ type: string; text?: string }>;
        const textContent = content
          .filter((item: { type: string; text?: string }) => item.type === "text")
          .map((item: { type: string; text?: string }) => item.text ?? "")
          .join("\n");

        return textContent;
      },
    });
  }

  console.log(`MCP server connected: ${config.name} (${tools.length} tools registered)`);
}

export async function disconnectAll(): Promise<void> {
  const closePromises = Array.from(activeConnections.values()).map(async (connection) => {
    try {
      await connection.client.close();
      console.log(`MCP server disconnected: ${connection.config.name}`);
    } catch (error) {
      console.error(`Error disconnecting MCP server ${connection.config.name}:`, error);
    }
  });

  await Promise.all(closePromises);
  activeConnections.clear();
}
