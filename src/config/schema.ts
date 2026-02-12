import { z } from "zod";

export const configSchema = z.object({
  platform: z.enum(["telegram", "whatsapp", "signal"]).default("telegram"),
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
    signalCliSocket: z.string().default("/var/run/signal-cli/socket"),
    ownerPhone: z.string().min(1),
    botPhone: z.string().min(1),
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
  return true;
}, {
  message: "Selected platform config must be provided (e.g. whatsapp config for platform: 'whatsapp')",
});

export type Config = z.infer<typeof configSchema>;
