import { loadConfig } from "./config/defaults.js";
import { createBot, startPolling, stopPolling } from "./messaging/telegram.js";
import { rejectAllPending } from "./approval/approval-gate.js";
import { disconnectAll } from "./tools/mcp-client.js";

// Import tools to register them
import "./tools/filesystem.js";
import "./tools/shell.js";
import "./tools/git.js";
import "./tools/claude-code.js";

async function main() {
  console.log("geofrey.ai starting...");

  // Load and validate config
  const config = loadConfig();
  console.log(`Orchestrator model: ${config.ollama.model}`);

  // TODO: Health check Ollama + preload model
  // TODO: Initialize database + run migrations
  // TODO: Connect MCP servers

  // Start Telegram bot
  const bot = createBot(config);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);

    // 1. Stop accepting new messages
    await stopPolling(bot);

    // 2. Reject pending approvals
    rejectAllPending("SHUTDOWN");

    // 3. Disconnect MCP servers
    await disconnectAll();

    // 4. TODO: Wait for in-flight tool executions (max 10s)
    // 5. TODO: Close SQLite connection
    // 6. TODO: Flush audit log

    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start long polling
  await startPolling(bot);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
