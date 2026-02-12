import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config/defaults.js";
import { createBot, startPolling, stopPolling } from "./messaging/telegram.js";
import { rejectAllPending } from "./approval/approval-gate.js";
import { disconnectAll } from "./tools/mcp-client.js";
import { getDb, closeDb } from "./db/client.js";
import { setDbUrl } from "./orchestrator/conversation.js";

// Import tools to register them
import "./tools/filesystem.js";
import "./tools/shell.js";
import "./tools/git.js";
import "./tools/claude-code.js";

async function main() {
  console.log("geofrey.ai starting...");

  const config = loadConfig();
  console.log(`Orchestrator model: ${config.ollama.model}`);

  // Ensure data directories exist
  await mkdir("data/audit", { recursive: true });

  // Initialize database
  getDb(config.database.url);
  setDbUrl(config.database.url);

  // TODO: Health check Ollama + preload model
  // TODO: Connect MCP servers

  const bot = createBot(config);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    await stopPolling(bot);
    rejectAllPending("SHUTDOWN");
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
