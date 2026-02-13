import { askChoice, askText, askYesNo } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";
import { stepHeader } from "../utils/ui.js";

export interface ProactiveResult {
  morningBrief: { enabled: boolean; time: string };
  calendarWatch: { enabled: boolean; reminderMinutesBefore: number };
  emailMonitor: { enabled: boolean; vipSenders: string[]; keywords: string[] };
}

export async function runProactiveStep(hasCalendar: boolean, hasGoogle: boolean): Promise<ProactiveResult> {
  stepHeader(7, t("onboarding.proactive.title"));

  // Morning Brief
  const morningEnabled = await askYesNo(t("onboarding.proactive.morning"));
  let morningTime = "07:00";
  if (morningEnabled) {
    morningTime = await askText(t("onboarding.proactive.morning.time"), "07:00");
  }

  // Calendar Watch (only if calendar configured)
  let calendarEnabled = false;
  let reminderMinutes = 10;
  if (hasCalendar) {
    calendarEnabled = await askYesNo(t("onboarding.proactive.calendar"));
    if (calendarEnabled) {
      const chosen = await askChoice<number>(t("onboarding.proactive.calendar.minutes"), [
        { name: "5", value: 5 },
        { name: "10", value: 10 },
        { name: "15", value: 15 },
        { name: "30", value: 30 },
      ]);
      reminderMinutes = chosen;
    }
  }

  // Email Monitor (only if Google configured)
  let emailEnabled = false;
  let vipSenders: string[] = [];
  let keywords: string[] = [];
  if (hasGoogle) {
    emailEnabled = await askYesNo(t("onboarding.proactive.email"));
    if (emailEnabled) {
      const vipRaw = await askText(t("onboarding.proactive.email.vip"), "");
      vipSenders = vipRaw ? vipRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const kwRaw = await askText(t("onboarding.proactive.email.keywords"), "");
      keywords = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
  }

  return {
    morningBrief: { enabled: morningEnabled, time: morningTime },
    calendarWatch: { enabled: calendarEnabled, reminderMinutesBefore: reminderMinutes },
    emailMonitor: { enabled: emailEnabled, vipSenders, keywords },
  };
}
