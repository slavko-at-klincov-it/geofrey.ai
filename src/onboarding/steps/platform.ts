import { stepHeader } from "../utils/ui.js";
import { askChoice } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";

export type Platform = "telegram" | "whatsapp" | "signal";

export async function choosePlatform(): Promise<Platform> {
  stepHeader(1, t("onboarding.platformTitle"));

  return askChoice<Platform>(t("onboarding.platformPrompt"), [
    { name: t("onboarding.platformTelegram"), value: "telegram" },
    { name: t("onboarding.platformWhatsApp"), value: "whatsapp" },
    { name: t("onboarding.platformSignal"), value: "signal" },
  ]);
}
