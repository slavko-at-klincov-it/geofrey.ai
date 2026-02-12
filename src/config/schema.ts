import { z } from "zod";

export const configSchema = z.object({
  telegram: z.object({
    botToken: z.string().min(1),
    ownerId: z.coerce.number().int().positive(),
  }),
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
    apiKey: z.string().optional(),
    model: z.string().default("claude-sonnet-4-5-20250929"),
  }),
  mcp: z.object({
    // Empty array = all servers allowed (no restriction). Non-empty = only listed servers.
    allowedServers: z.array(z.string()).default([]),
  }),
});

export type Config = z.infer<typeof configSchema>;
