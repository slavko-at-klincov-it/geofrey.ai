import { z } from "zod";

export const configSchema = z.object({
  locale: z.enum(["de", "en"]).default("de"),
  telegram: z.object({
    botToken: z.string().min(1),
    ownerId: z.coerce.number().int().positive(),
  }),
  database: z.object({
    url: z.string().default("./data/app.db"),
  }),
  dashboard: z.object({
    enabled: z.boolean().default(true),
    port: z.coerce.number().int().default(3003),
    token: z.string().optional(),
  }),
  ais: z.object({
    apiKey: z.string().optional(),
    enabled: z.boolean().default(false),
  }),
  opensky: z.object({
    user: z.string().optional(),
    pass: z.string().optional(),
    enabled: z.boolean().default(false),
    pollIntervalMs: z.coerce.number().int().default(60_000),
  }),
  dhl: z.object({
    apiKey: z.string().optional(),
    enabled: z.boolean().default(false),
    pollIntervalMs: z.coerce.number().int().default(300_000),
  }),
});

export type Config = z.infer<typeof configSchema>;
