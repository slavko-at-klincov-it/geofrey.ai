import { configSchema, type Config } from "./schema.js";

export function loadConfig(): Config {
  return configSchema.parse({
    platform: process.env.PLATFORM,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      ownerId: process.env.TELEGRAM_OWNER_ID,
    },
    whatsapp: process.env.WHATSAPP_PHONE_NUMBER_ID ? {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      ownerPhone: process.env.WHATSAPP_OWNER_PHONE,
      webhookPort: process.env.WHATSAPP_WEBHOOK_PORT,
    } : undefined,
    signal: process.env.SIGNAL_OWNER_PHONE ? {
      signalCliSocket: process.env.SIGNAL_CLI_SOCKET,
      ownerPhone: process.env.SIGNAL_OWNER_PHONE,
      botPhone: process.env.SIGNAL_BOT_PHONE,
    } : undefined,
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
      enabled: process.env.CLAUDE_CODE_ENABLED !== undefined
        ? process.env.CLAUDE_CODE_ENABLED === "true"
        : undefined,
      skipPermissions: process.env.CLAUDE_CODE_SKIP_PERMISSIONS !== undefined
        ? process.env.CLAUDE_CODE_SKIP_PERMISSIONS === "true"
        : undefined,
      outputFormat: process.env.CLAUDE_CODE_OUTPUT_FORMAT,
      maxBudgetUsd: process.env.CLAUDE_CODE_MAX_BUDGET_USD,
      model: process.env.CLAUDE_CODE_MODEL,
      sessionTtlMs: process.env.CLAUDE_CODE_SESSION_TTL_MS,
      timeoutMs: process.env.CLAUDE_CODE_TIMEOUT_MS,
      defaultDirs: process.env.CLAUDE_CODE_DEFAULT_DIRS
        ? process.env.CLAUDE_CODE_DEFAULT_DIRS.split(",").map((s) => s.trim())
        : undefined,
      mcpConfigPath: process.env.CLAUDE_CODE_MCP_CONFIG,
    },
    mcp: {
      allowedServers: process.env.MCP_ALLOWED_SERVERS
        ? process.env.MCP_ALLOWED_SERVERS.split(",").map((s) => s.trim())
        : [],
    },
  });
}
