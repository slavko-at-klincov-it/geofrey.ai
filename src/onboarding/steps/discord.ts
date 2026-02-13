import { stepHeader, fail } from "../utils/ui.js";
import { askText, askSecret } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";

export interface DiscordSetupConfig {
  botToken: string;
  channelId: string;
}

export async function setupDiscord(): Promise<DiscordSetupConfig | null> {
  stepHeader(2, t("onboarding.discordTitle"));

  console.log(t("onboarding.discordPrereqs"));

  const botToken = await askSecret(t("onboarding.discordBotToken"));
  if (!botToken.trim()) { fail(t("onboarding.discordAborted")); return null; }

  const channelId = await askText(t("onboarding.discordChannelId"));
  if (!channelId.trim()) { fail(t("onboarding.discordAborted")); return null; }

  return { botToken, channelId };
}
