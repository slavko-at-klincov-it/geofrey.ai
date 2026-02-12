import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askText, askSecret, askYesNo } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  ownerPhone: string;
  webhookPort: number;
}

export async function setupWhatsApp(): Promise<WhatsAppConfig | null> {
  stepHeader(2, t("onboarding.whatsappTitle"));

  console.log(t("onboarding.whatsappPrereqs"));

  const phoneNumberId = await askText(t("onboarding.phoneNumberId"));
  if (!phoneNumberId.trim()) { fail(t("onboarding.phoneNumberIdMissing")); return null; }

  const accessToken = await askSecret(t("onboarding.accessTokenPrompt"));
  if (!accessToken.trim()) { fail(t("onboarding.accessTokenMissing")); return null; }

  // Validate via Graph API
  const spin = spinner(t("onboarding.connectionCheck"));
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      spin.succeed(t("onboarding.whatsappConnected"));
    } else {
      spin.fail(t("onboarding.whatsappConnectionFailed"));
      const cont = await askYesNo(t("onboarding.continueAnyway"), false);
      if (!cont) return null;
    }
  } catch {
    spin.fail(t("onboarding.networkError"));
    const cont = await askYesNo(t("onboarding.continueAnyway"), false);
    if (!cont) return null;
  }

  const verifyToken = await askText(t("onboarding.verifyTokenPrompt"), `geofrey-${Date.now()}`);
  const ownerPhone = await askText(t("onboarding.ownerPhonePrompt"));
  if (!ownerPhone.trim()) { fail(t("onboarding.phoneMissing")); return null; }

  const portStr = await askText(t("onboarding.webhookPortPrompt"), "3000");
  const webhookPort = parseInt(portStr, 10);

  info(t("onboarding.whatsappPrivacyHint"));
  info(t("onboarding.whatsappPrivacyPath"));

  return { phoneNumberId, accessToken, verifyToken, ownerPhone, webhookPort };
}
