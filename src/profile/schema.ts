import { z } from "zod";

function objectWithDefaults<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => v ?? {}, schema);
}

const calendarConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("google"), calendarId: z.string().default("primary") }),
  z.object({ provider: z.literal("caldav"), url: z.string().url() }),
  z.object({ provider: z.literal("none") }),
]);

const notesConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("obsidian"), vaultPath: z.string() }),
  z.object({ provider: z.literal("notion"), apiKey: z.string() }),
  z.object({ provider: z.literal("apple-notes") }),
  z.object({ provider: z.literal("files"), directory: z.string() }),
  z.object({ provider: z.literal("none") }),
]);

const taskConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("todoist"), apiKey: z.string() }),
  z.object({ provider: z.literal("things3") }),
  z.object({ provider: z.literal("apple-reminders") }),
  z.object({ provider: z.literal("none") }),
]);

const morningBriefSchema = z.object({
  enabled: z.boolean().default(false),
  time: z.string().regex(/^\d{2}:\d{2}$/).default("07:00"),
  includeCalendar: z.boolean().default(true),
  includeEmail: z.boolean().default(true),
  includeMemory: z.boolean().default(true),
});

const calendarWatchSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(60).default(15),
  reminderMinutesBefore: z.number().int().min(1).max(120).default(10),
});

const emailMonitorSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(60).default(15),
  vipSenders: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

export const profileSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  timezone: z.string().default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  workDirectory: z.string().optional(),
  communicationStyle: z.enum(["formal", "casual", "mixed"]).default("mixed"),
  interests: z.array(z.string()).default([]),
  calendarApp: calendarConfigSchema.default({ provider: "none" }),
  notesApp: notesConfigSchema.default({ provider: "none" }),
  taskApp: taskConfigSchema.default({ provider: "none" }),
  morningBrief: objectWithDefaults(morningBriefSchema),
  calendarWatch: objectWithDefaults(calendarWatchSchema),
  emailMonitor: objectWithDefaults(emailMonitorSchema),
});

export type Profile = z.infer<typeof profileSchema>;
export type CalendarConfig = z.infer<typeof calendarConfigSchema>;
export type NotesConfig = z.infer<typeof notesConfigSchema>;
export type TaskConfig = z.infer<typeof taskConfigSchema>;
