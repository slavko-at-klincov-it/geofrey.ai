import { ZodError } from "zod";
import { configSchema, type Config } from "./schema.js";

// Map Zod schema paths to environment variable names
const pathToEnvVar: Record<string, string> = {
  "telegram.botToken": "TELEGRAM_BOT_TOKEN",
  "telegram.ownerId": "TELEGRAM_OWNER_ID",
  "whatsapp.phoneNumberId": "WHATSAPP_PHONE_NUMBER_ID",
  "whatsapp.accessToken": "WHATSAPP_ACCESS_TOKEN",
  "whatsapp.verifyToken": "WHATSAPP_VERIFY_TOKEN",
  "whatsapp.ownerPhone": "WHATSAPP_OWNER_PHONE",
  "signal.ownerPhone": "SIGNAL_OWNER_PHONE",
  "signal.botPhone": "SIGNAL_BOT_PHONE",
  "ollama.baseUrl": "OLLAMA_BASE_URL",
  "ollama.model": "ORCHESTRATOR_MODEL",
  "claude.model": "CLAUDE_CODE_MODEL",
};

function formatZodError(error: ZodError): string {
  const errorMessages: string[] = [];

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const envVar = pathToEnvVar[path] || path;

    switch (issue.code) {
      case "too_small":
        if (issue.type === "string" && issue.minimum === 1) {
          errorMessages.push(`Missing ${envVar} — set it in .env or run 'pnpm setup'`);
        } else {
          errorMessages.push(`Invalid ${envVar} — ${issue.message.toLowerCase()}`);
        }
        break;
      case "invalid_type":
        if (issue.received === "undefined") {
          errorMessages.push(`Missing ${envVar} — set it in .env or run 'pnpm setup'`);
        } else {
          errorMessages.push(`Invalid ${envVar} — expected ${issue.expected}, got ${issue.received}`);
        }
        break;
      case "invalid_string":
        if (issue.validation === "url") {
          errorMessages.push(`Invalid ${envVar} — must be a valid URL (e.g. http://localhost:11434)`);
        } else {
          errorMessages.push(`Invalid ${envVar} — ${issue.message.toLowerCase()}`);
        }
        break;
      case "invalid_enum_value":
        errorMessages.push(`Invalid ${envVar} — must be one of: ${issue.options.join(", ")}`);
        break;
      case "custom":
        errorMessages.push(issue.message);
        break;
      default:
        errorMessages.push(`Invalid ${envVar} — ${issue.message.toLowerCase()}`);
    }
  }

  return errorMessages.join("\n");
}

export function loadConfig(): Config {
  try {
    return configSchema.parse({
      locale: process.env.LOCALE,
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
        apiKey: process.env.ANTHROPIC_API_KEY,
        mcpConfigPath: process.env.CLAUDE_CODE_MCP_CONFIG,
      },
      mcp: {
        allowedServers: process.env.MCP_ALLOWED_SERVERS
          ? process.env.MCP_ALLOWED_SERVERS.split(",").map((s) => s.trim())
          : [],
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedErrors = formatZodError(error);
      console.error("\nConfiguration error(s):\n");
      console.error(formattedErrors);
      console.error("\nRun 'pnpm setup' to configure interactively\n");
      throw new Error("Invalid configuration — fix the errors above and restart");
    }
    throw error;
  }
}
