import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askText, askSecret, askYesNo } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";

export interface WhatsAppConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
  ownerPhone: string;
  webhookPort: number;
}

export async function setupWhatsApp(): Promise<WhatsAppConfig | null> {
  stepHeader(2, t("onboarding.whatsappTitle"));

  console.log(t("onboarding.whatsappPrereqs"));

  const accountSid = await askText(t("onboarding.twilioAccountSid"));
  if (!accountSid.trim() || !accountSid.startsWith("AC")) {
    fail(t("onboarding.twilioAccountSidInvalid"));
    return null;
  }

  const authToken = await askSecret(t("onboarding.twilioAuthToken"));
  if (!authToken.trim()) { fail(t("onboarding.twilioAuthTokenMissing")); return null; }

  // Validate via Twilio API
  const spin = spinner(t("onboarding.connectionCheck"));
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
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

  const whatsappNumber = await askText(t("onboarding.twilioWhatsAppNumber"));
  if (!whatsappNumber.trim()) { fail(t("onboarding.twilioWhatsAppNumberMissing")); return null; }

  const ownerPhone = await askText(t("onboarding.ownerPhonePrompt"));
  if (!ownerPhone.trim()) { fail(t("onboarding.phoneMissing")); return null; }

  const portStr = await askText(t("onboarding.webhookPortPrompt"), "3000");
  const webhookPort = parseInt(portStr, 10);

  info(t("onboarding.twilioWebhookHint", { port: String(webhookPort) }));

  return { accountSid, authToken, whatsappNumber, ownerPhone, webhookPort };
}
