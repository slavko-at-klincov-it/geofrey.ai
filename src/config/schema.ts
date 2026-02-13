import { z } from "zod";
import { platform } from "node:os";

const DEFAULT_SIGNAL_SOCKET = platform() === "win32"
  ? "\\\\.\\pipe\\signal-cli"
  : "/var/run/signal-cli/socket";

export const configSchema = z.object({
  locale: z.enum(["de", "en"]).default("de"),
  platform: z.enum(["telegram", "whatsapp", "signal", "webchat", "slack", "discord"]).default("telegram"),
  telegram: z.object({
    botToken: z.string().min(1),
    ownerId: z.coerce.number().int().positive(),
  }),
  whatsapp: z.object({
    phoneNumberId: z.string().min(1),
    accessToken: z.string().min(1),
    verifyToken: z.string().min(1),
    ownerPhone: z.string().min(1),
    webhookPort: z.coerce.number().int().default(3000),
  }).optional(),
  signal: z.object({
    signalCliSocket: z.string().default(DEFAULT_SIGNAL_SOCKET),
    ownerPhone: z.string().min(1),
    botPhone: z.string().min(1),
  }).optional(),
  slack: z.object({
    botToken: z.string().min(1),
    appToken: z.string().min(1),
    channelId: z.string().min(1),
  }).optional(),
  discord: z.object({
    botToken: z.string().min(1),
    channelId: z.string().min(1),
  }).optional(),
  ollama: z.object({
    baseUrl: z.string().url().default("http://localhost:11434"),
    model: z.string().default("qwen3:8b"),
    numCtx: z.coerce.number().int().default(16384),
  }),
  database: z.object({
    url: z.string().default("./data/app.db"),
  }),
  audit: z.object({
    logDir: z.string().default("./data/audit"),
  }),
  limits: z.object({
    maxAgentSteps: z.coerce.number().int().default(15),
    approvalTimeoutMs: z.coerce.number().int().default(300_000),
    maxConsecutiveErrors: z.coerce.number().int().default(3),
  }),
  claude: z.object({
    enabled: z.boolean().default(true),
    skipPermissions: z.boolean().default(true),
    outputFormat: z.enum(["json", "stream-json", "text"]).default("stream-json"),
    maxBudgetUsd: z.coerce.number().optional(),
    model: z.string().default("claude-sonnet-4-5-20250929"),
    sessionTtlMs: z.coerce.number().int().default(3_600_000),
    timeoutMs: z.coerce.number().int().default(600_000),
    defaultDirs: z.array(z.string()).default([]),
    apiKey: z.string().optional(),
    mcpConfigPath: z.string().optional(),
    toolProfiles: z.object({
      readOnly: z.string().default("Read Glob Grep"),
      standard: z.string().default("Read Glob Grep Edit Write Bash(git:*)"),
      full: z.string().default("Read Glob Grep Edit Write Bash"),
    }).default({}),
  }),
  imageSanitizer: z.object({
    enabled: z.boolean().default(true),
    maxInputSizeBytes: z.coerce.number().int().positive().default(20_971_520),
    scanForInjection: z.boolean().default(true),
  }).default({}),
  dashboard: z.object({
    enabled: z.boolean().default(false),
    port: z.coerce.number().int().default(3001),
    token: z.string().optional(),
  }).default({}),
  search: z.object({
    provider: z.enum(["searxng", "brave"]).default("searxng"),
    searxngUrl: z.string().url().default("http://localhost:8080"),
    braveApiKey: z.string().optional(),
  }).default({}),
  billing: z.object({
    maxDailyBudgetUsd: z.coerce.number().positive().optional(),
  }).default({}),
  voice: z.object({
    sttProvider: z.enum(["openai", "local"]).default("openai"),
    openaiApiKey: z.string().optional(),
    whisperModelPath: z.string().optional(),
  }).default({}),
  tts: z.object({
    apiKey: z.string().optional(),
    voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
    model: z.string().default("eleven_multilingual_v2"),
    cacheSize: z.coerce.number().int().positive().default(50),
  }).default({}),
  sandbox: z.object({
    enabled: z.boolean().default(false),
    image: z.string().default("node:22-slim"),
    memoryLimit: z.string().default("512m"),
    networkEnabled: z.boolean().default(false),
    pidsLimit: z.coerce.number().int().positive().default(64),
    readOnly: z.boolean().default(false),
    ttlMs: z.coerce.number().int().positive().default(1_800_000),
  }).default({}),
  models: z.object({
    openrouterApiKey: z.string().optional(),
    defaultModel: z.string().optional(),
    failoverChain: z.array(z.string()).default([]),
    taskModels: z.record(z.string()).default({}),
  }).default({}),
  webhook: z.object({
    enabled: z.boolean().default(false),
    port: z.coerce.number().int().default(3002),
    host: z.string().default("localhost"),
    rateLimit: z.coerce.number().int().positive().default(60),
  }).default({}),
  mcp: z.object({
    // Empty array = all servers allowed (no restriction). Non-empty = only listed servers.
    allowedServers: z.array(z.string()).default([]),
  }),
}).refine((data) => {
  if (data.platform === "whatsapp" && !data.whatsapp) {
    return false;
  }
  if (data.platform === "signal" && !data.signal) {
    return false;
  }
  if (data.platform === "slack" && !data.slack) {
    return false;
  }
  if (data.platform === "discord" && !data.discord) {
    return false;
  }
  if (data.platform === "webchat" && !data.dashboard.enabled) {
    return false;
  }
  return true;
}, {
  message: "Selected platform config must be provided (e.g. whatsapp config for platform: 'whatsapp', dashboard.enabled for platform: 'webchat')",
});

export type Config = z.infer<typeof configSchema>;
