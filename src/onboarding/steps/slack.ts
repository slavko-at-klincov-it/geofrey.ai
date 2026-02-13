import { stepHeader, fail } from "../utils/ui.js";
import { askText, askSecret } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";

export interface SlackSetupConfig {
  botToken: string;
  appToken: string;
  channelId: string;
}

export async function setupSlack(): Promise<SlackSetupConfig | null> {
  stepHeader(2, t("onboarding.slackTitle"));

  console.log(t("onboarding.slackPrereqs"));

  const botToken = await askSecret(t("onboarding.slackBotToken"));
  if (!botToken.trim()) { fail(t("onboarding.slackAborted")); return null; }

  const appToken = await askSecret(t("onboarding.slackAppToken"));
  if (!appToken.trim()) { fail(t("onboarding.slackAborted")); return null; }

  const channelId = await askText(t("onboarding.slackChannelId"));
  if (!channelId.trim()) { fail(t("onboarding.slackAborted")); return null; }

  return { botToken, appToken, channelId };
}
