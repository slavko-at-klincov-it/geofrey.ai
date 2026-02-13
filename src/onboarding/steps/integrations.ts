import { askChoice, askText, askYesNo, askSecret } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";
import { stepHeader } from "../utils/ui.js";
import type { CalendarConfig, NotesConfig, TaskConfig } from "../../profile/schema.js";

export interface IntegrationsResult {
  calendarApp: CalendarConfig;
  notesApp: NotesConfig;
  taskApp: TaskConfig;
}

export async function runIntegrationsStep(): Promise<IntegrationsResult> {
  stepHeader(6, t("onboarding.integrations.title"));

  // Calendar
  const calProvider = await askChoice<"google" | "caldav" | "none">(
    t("onboarding.integrations.calendar"),
    [
      { name: t("onboarding.integrations.calendar.google"), value: "google" as const },
      { name: t("onboarding.integrations.calendar.caldav"), value: "caldav" as const },
      { name: t("onboarding.integrations.calendar.none"), value: "none" as const },
    ],
  );

  let calendarApp: CalendarConfig;
  if (calProvider === "google") {
    calendarApp = { provider: "google", calendarId: "primary" };
    // Optionally offer OAuth if env vars present
    if (process.env.GOOGLE_CLIENT_ID) {
      const doOAuth = await askYesNo(t("onboarding.integrations.calendar.google.oauth"));
      if (doOAuth) {
        try {
          const { getAuthUrl, startOAuthCallbackServer } = await import("../../integrations/google/auth.js");
          const url = getAuthUrl([
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/gmail.readonly",
          ]);
          console.log(`\n  ${url}\n`);
          await startOAuthCallbackServer();
        } catch {
          // OAuth optional — ignore errors
        }
      }
    }
  } else if (calProvider === "caldav") {
    const url = await askText(t("onboarding.integrations.calendar.caldav.url"));
    calendarApp = { provider: "caldav", url };
  } else {
    calendarApp = { provider: "none" };
  }

  // Notes
  const notesProvider = await askChoice<"obsidian" | "notion" | "apple-notes" | "files" | "none">(
    t("onboarding.integrations.notes"),
    [
      { name: t("onboarding.integrations.notes.obsidian"), value: "obsidian" as const },
      { name: t("onboarding.integrations.notes.notion"), value: "notion" as const },
      { name: t("onboarding.integrations.notes.apple"), value: "apple-notes" as const },
      { name: t("onboarding.integrations.notes.files"), value: "files" as const },
      { name: t("onboarding.integrations.notes.none"), value: "none" as const },
    ],
  );

  let notesApp: NotesConfig;
  if (notesProvider === "obsidian") {
    const vaultPath = await askText(t("onboarding.integrations.notes.obsidian.path"));
    notesApp = { provider: "obsidian", vaultPath };
  } else if (notesProvider === "notion") {
    const apiKey = await askSecret(t("onboarding.integrations.notes.notion.key"));
    notesApp = { provider: "notion", apiKey };
  } else if (notesProvider === "files") {
    const directory = await askText(t("onboarding.integrations.notes.files.dir"));
    notesApp = { provider: "files", directory };
  } else if (notesProvider === "apple-notes") {
    notesApp = { provider: "apple-notes" };
  } else {
    notesApp = { provider: "none" };
  }

  // Tasks
  const taskProvider = await askChoice<"todoist" | "things3" | "apple-reminders" | "none">(
    t("onboarding.integrations.tasks"),
    [
      { name: t("onboarding.integrations.tasks.todoist"), value: "todoist" as const },
      { name: t("onboarding.integrations.tasks.things"), value: "things3" as const },
      { name: t("onboarding.integrations.tasks.reminders"), value: "apple-reminders" as const },
      { name: t("onboarding.integrations.tasks.none"), value: "none" as const },
    ],
  );

  let taskApp: TaskConfig;
  if (taskProvider === "todoist") {
    const apiKey = await askSecret(t("onboarding.integrations.tasks.todoist.key"));
    taskApp = { provider: "todoist", apiKey };
  } else if (taskProvider === "things3") {
    taskApp = { provider: "things3" };
  } else if (taskProvider === "apple-reminders") {
    taskApp = { provider: "apple-reminders" };
  } else {
    taskApp = { provider: "none" };
  }

  return { calendarApp, notesApp, taskApp };
}
