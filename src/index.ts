import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config/defaults.js";
import { createBot, startPolling, stopPolling } from "./messaging/telegram.js";
import { rejectAllPending } from "./approval/approval-gate.js";
import { disconnectAll, connectMcpServer } from "./tools/mcp-client.js";
import { getDb, closeDb } from "./db/client.js";
import { setDbUrl } from "./orchestrator/conversation.js";

// Import tools to register them
import "./tools/filesystem.js";
import "./tools/shell.js";
import "./tools/git.js";
import "./tools/claude-code.js";

let inFlightCount = 0;

export function trackInflight(delta: number) {
  inFlightCount += delta;
}

async function healthCheckOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name).join(", ") ?? "none";
      console.log(`Ollama OK — available models: ${models}`);
      return true;
    }
    console.warn(`Ollama responded ${res.status} — may not be ready yet`);
    return false;
  } catch {
    console.warn("Ollama not reachable — start it with 'ollama serve'");
    return false;
  }
}

async function waitForInflight(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (inFlightCount > 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (inFlightCount > 0) {
    console.warn(`${inFlightCount} in-flight operations still running at shutdown`);
  }
}

async function main() {
  console.log("geofrey.ai starting...");

  const config = loadConfig();
  console.log(`Orchestrator model: ${config.ollama.model}`);

  // Ensure data directories exist
  await mkdir("data/audit", { recursive: true });

  // Initialize database
  getDb(config.database.url);
  setDbUrl(config.database.url);

  // Health check Ollama (non-blocking)
  await healthCheckOllama(config.ollama.baseUrl);

  // Connect MCP servers (if configured via env)
  const mcpServersEnv = process.env.MCP_SERVERS;
  if (mcpServersEnv) {
    try {
      const servers = JSON.parse(mcpServersEnv) as Array<{ name: string; command: string; args?: string[] }>;
      for (const server of servers) {
        await connectMcpServer(server);
      }
    } catch (err) {
      console.warn("Failed to parse MCP_SERVERS:", err);
    }
  }

  const bot = createBot(config);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    await stopPolling(bot);
    rejectAllPending("SHUTDOWN");
    await waitForInflight(10_000);
    await disconnectAll();
    closeDb();
    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await startPolling(bot);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
