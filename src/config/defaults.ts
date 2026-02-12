import { configSchema, type Config } from "./schema.js";

export function loadConfig(): Config {
  return configSchema.parse({
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      ownerId: process.env.TELEGRAM_OWNER_ID,
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.ORCHESTRATOR_MODEL,
      numCtx: process.env.ORCHESTRATOR_NUM_CTX,
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    audit: {
      logDir: process.env.AUDIT_LOG_DIR,
    },
    limits: {
      maxAgentSteps: process.env.MAX_AGENT_STEPS,
      approvalTimeoutMs: process.env.APPROVAL_TIMEOUT_MS,
      maxConsecutiveErrors: process.env.MAX_CONSECUTIVE_ERRORS,
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL,
    },
    mcp: {
      allowedServers: process.env.MCP_ALLOWED_SERVERS
        ? process.env.MCP_ALLOWED_SERVERS.split(",").map((s) => s.trim())
        : [],
    },
  });
}
