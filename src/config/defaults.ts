import { ZodError } from "zod";
import { configSchema, type Config } from "./schema.js";

// Map Zod schema paths to environment variable names
const pathToEnvVar: Record<string, string> = {
  "telegram.botToken": "TELEGRAM_BOT_TOKEN",
  "telegram.ownerId": "TELEGRAM_OWNER_ID",
  "whatsapp.accountSid": "TWILIO_ACCOUNT_SID",
  "whatsapp.authToken": "TWILIO_AUTH_TOKEN",
  "whatsapp.whatsappNumber": "TWILIO_WHATSAPP_NUMBER",
  "whatsapp.ownerPhone": "WHATSAPP_OWNER_PHONE",
  "signal.ownerPhone": "SIGNAL_OWNER_PHONE",
  "signal.botPhone": "SIGNAL_BOT_PHONE",
  "ollama.baseUrl": "OLLAMA_BASE_URL",
  "ollama.model": "ORCHESTRATOR_MODEL",
  "ollama.embedModel": "EMBEDDING_MODEL",
  "claude.model": "CLAUDE_CODE_MODEL",
  "billing.maxDailyBudgetUsd": "MAX_DAILY_BUDGET_USD",
  "slack.botToken": "SLACK_BOT_TOKEN",
  "slack.appToken": "SLACK_APP_TOKEN",
  "slack.channelId": "SLACK_CHANNEL_ID",
  "discord.botToken": "DISCORD_BOT_TOKEN",
  "discord.channelId": "DISCORD_CHANNEL_ID",
  "voice.sttProvider": "VOICE_STT_PROVIDER",
  "voice.openaiApiKey": "OPENAI_API_KEY",
  "voice.whisperModelPath": "WHISPER_MODEL_PATH",
  "tts.apiKey": "ELEVENLABS_API_KEY",
  "tts.voiceId": "ELEVENLABS_VOICE_ID",
  "companion.wsPort": "COMPANION_WS_PORT",
  "smartHome.hueBridgeIp": "HUE_BRIDGE_IP",
  "smartHome.hueApiKey": "HUE_API_KEY",
  "smartHome.haUrl": "HOMEASSISTANT_URL",
  "smartHome.haToken": "HOMEASSISTANT_TOKEN",
  "smartHome.sonosHttpApiUrl": "SONOS_HTTP_API_URL",
  "google.clientId": "GOOGLE_CLIENT_ID",
  "google.clientSecret": "GOOGLE_CLIENT_SECRET",
  "google.redirectUrl": "GOOGLE_REDIRECT_URL",
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
      telegram: process.env.TELEGRAM_BOT_TOKEN ? {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        ownerId: process.env.TELEGRAM_OWNER_ID,
      } : undefined,
      whatsapp: process.env.TWILIO_ACCOUNT_SID ? {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
        ownerPhone: process.env.WHATSAPP_OWNER_PHONE,
        webhookPort: process.env.WHATSAPP_WEBHOOK_PORT,
      } : undefined,
      signal: process.env.SIGNAL_OWNER_PHONE ? {
        signalCliSocket: process.env.SIGNAL_CLI_SOCKET,
        ownerPhone: process.env.SIGNAL_OWNER_PHONE,
        botPhone: process.env.SIGNAL_BOT_PHONE,
      } : undefined,
      slack: process.env.SLACK_BOT_TOKEN ? {
        botToken: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        channelId: process.env.SLACK_CHANNEL_ID,
      } : undefined,
      discord: process.env.DISCORD_BOT_TOKEN ? {
        botToken: process.env.DISCORD_BOT_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID,
      } : undefined,
      voice: {
        sttProvider: process.env.VOICE_STT_PROVIDER,
        openaiApiKey: process.env.OPENAI_API_KEY,
        whisperModelPath: process.env.WHISPER_MODEL_PATH,
      },
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL,
        model: process.env.ORCHESTRATOR_MODEL,
        embedModel: process.env.EMBEDDING_MODEL,
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
      imageSanitizer: {
        enabled: process.env.IMAGE_SANITIZER_ENABLED !== undefined
          ? process.env.IMAGE_SANITIZER_ENABLED === "true"
          : undefined,
        maxInputSizeBytes: process.env.IMAGE_SANITIZER_MAX_SIZE,
        scanForInjection: process.env.IMAGE_SANITIZER_SCAN_INJECTION !== undefined
          ? process.env.IMAGE_SANITIZER_SCAN_INJECTION === "true"
          : undefined,
      },
      dashboard: {
        enabled: process.env.DASHBOARD_ENABLED !== undefined
          ? process.env.DASHBOARD_ENABLED === "true"
          : undefined,
        port: process.env.DASHBOARD_PORT,
        token: process.env.DASHBOARD_TOKEN,
      },
      search: {
        provider: process.env.SEARCH_PROVIDER,
        searxngUrl: process.env.SEARXNG_URL,
        braveApiKey: process.env.BRAVE_API_KEY,
      },
      billing: {
        maxDailyBudgetUsd: process.env.MAX_DAILY_BUDGET_USD,
      },
      sandbox: {
        enabled: process.env.SANDBOX_ENABLED !== undefined
          ? process.env.SANDBOX_ENABLED === "true"
          : undefined,
        image: process.env.SANDBOX_IMAGE,
        memoryLimit: process.env.SANDBOX_MEMORY_LIMIT,
        networkEnabled: process.env.SANDBOX_NETWORK !== undefined
          ? process.env.SANDBOX_NETWORK === "true"
          : undefined,
        pidsLimit: process.env.SANDBOX_PIDS_LIMIT,
        readOnly: process.env.SANDBOX_READ_ONLY !== undefined
          ? process.env.SANDBOX_READ_ONLY === "true"
          : undefined,
        ttlMs: process.env.SANDBOX_TTL_MS,
      },
      webhook: {
        enabled: process.env.WEBHOOK_ENABLED !== undefined
          ? process.env.WEBHOOK_ENABLED === "true"
          : undefined,
        port: process.env.WEBHOOK_PORT,
        host: process.env.WEBHOOK_HOST,
        rateLimit: process.env.WEBHOOK_RATE_LIMIT,
      },
      agents: {
        enabled: process.env.AGENTS_ENABLED !== undefined
          ? process.env.AGENTS_ENABLED === "true"
          : undefined,
        routingStrategy: process.env.AGENTS_ROUTING_STRATEGY,
        maxConcurrentAgents: process.env.AGENTS_MAX_CONCURRENT,
        sessionIsolation: process.env.AGENTS_SESSION_ISOLATION !== undefined
          ? process.env.AGENTS_SESSION_ISOLATION === "true"
          : undefined,
      },
      tts: {
        enabled: process.env.TTS_ENABLED !== undefined
          ? process.env.TTS_ENABLED === "true"
          : undefined,
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID,
        cacheLruSize: process.env.TTS_CACHE_LRU_SIZE,
      },
      companion: {
        enabled: process.env.COMPANION_ENABLED !== undefined
          ? process.env.COMPANION_ENABLED === "true"
          : undefined,
        wsPort: process.env.COMPANION_WS_PORT,
        pairingTtlMs: process.env.COMPANION_PAIRING_TTL_MS,
        apnsKeyPath: process.env.APNS_KEY_PATH,
        apnsKeyId: process.env.APNS_KEY_ID,
        apnsTeamId: process.env.APNS_TEAM_ID,
        apnsBundleId: process.env.APNS_BUNDLE_ID,
        fcmServerKey: process.env.FCM_SERVER_KEY,
      },
      smartHome: {
        enabled: process.env.SMART_HOME_ENABLED !== undefined
          ? process.env.SMART_HOME_ENABLED === "true"
          : undefined,
        hueBridgeIp: process.env.HUE_BRIDGE_IP,
        hueApiKey: process.env.HUE_API_KEY,
        haUrl: process.env.HOMEASSISTANT_URL,
        haToken: process.env.HOMEASSISTANT_TOKEN,
        sonosHttpApiUrl: process.env.SONOS_HTTP_API_URL,
      },
      google: {
        enabled: process.env.GOOGLE_ENABLED !== undefined
          ? process.env.GOOGLE_ENABLED === "true"
          : undefined,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUrl: process.env.GOOGLE_REDIRECT_URL,
        tokenCachePath: process.env.GOOGLE_TOKEN_CACHE_PATH,
      },
      anonymizer: {
        enabled: process.env.ANONYMIZER_ENABLED !== undefined
          ? process.env.ANONYMIZER_ENABLED === "true"
          : undefined,
        llmPass: process.env.ANONYMIZER_LLM_PASS !== undefined
          ? process.env.ANONYMIZER_LLM_PASS === "true"
          : undefined,
        customTerms: process.env.ANONYMIZER_CUSTOM_TERMS
          ? process.env.ANONYMIZER_CUSTOM_TERMS.split(",").map((s) => s.trim())
          : undefined,
        skipCategories: process.env.ANONYMIZER_SKIP_CATEGORIES
          ? process.env.ANONYMIZER_SKIP_CATEGORIES.split(",").map((s) => s.trim())
          : undefined,
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
