import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";
import { t } from "../../i18n/index.js";

interface WhatsAppConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
  ownerPhone: string;
  webhookPort: number;
}

function twilioApiBase(sid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
}

function basicAuth(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/** Twilio expects whatsapp: prefix on phone numbers */
function waPrefix(phone: string): string {
  const normalized = phone.startsWith("+") ? phone : `+${phone}`;
  return `whatsapp:${normalized}`;
}

/**
 * Validate Twilio webhook signature (HMAC-SHA1).
 * Twilio signs: URL + sorted POST params concatenated, using Auth Token as key.
 */
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + params[key];
  }
  const expected = createHmac("sha1", authToken)
    .update(dataString)
    .digest("base64");
  return signature === expected;
}

export function createWhatsAppPlatform(
  config: WhatsAppConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  let server: Server | null = null;
  let msgCounter = 0;

  // Content template SID for quick-reply approval buttons (created on start)
  let contentTemplateSid: string | null = null;

  // Track pending approval nonce for text-based fallback
  let pendingApprovalNonce: string | null = null;

  const auth = basicAuth(config.accountSid, config.authToken);

  async function sendTwilioMessage(to: string, body: string): Promise<string> {
    const params = new URLSearchParams();
    params.set("From", waPrefix(config.whatsappNumber));
    params.set("To", waPrefix(to));
    params.set("Body", body);

    const res = await fetch(twilioApiBase(config.accountSid), {
      method: "POST",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio API ${res.status}: ${text}`);
    }
    const data = await res.json() as { sid: string };
    return data.sid;
  }

  async function sendTwilioContentMessage(to: string, contentSid: string, contentVars: Record<string, string>): Promise<string> {
    const params = new URLSearchParams();
    params.set("From", waPrefix(config.whatsappNumber));
    params.set("To", waPrefix(to));
    params.set("ContentSid", contentSid);
    params.set("ContentVariables", JSON.stringify(contentVars));

    const res = await fetch(twilioApiBase(config.accountSid), {
      method: "POST",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio Content API ${res.status}: ${text}`);
    }
    const data = await res.json() as { sid: string };
    return data.sid;
  }

  async function createApprovalTemplate(): Promise<string | null> {
    try {
      const res = await fetch("https://content.twilio.com/v1/Content", {
        method: "POST",
        headers: {
          "Authorization": auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          friendly_name: "geofrey_approval",
          language: "en",
          variables: {
            "1": "Approval text",
          },
          types: {
            "twilio/quick-reply": {
              body: "{{1}}",
              actions: [
                { id: "approve", title: t("messaging.approve") },
                { id: "deny", title: t("messaging.deny") },
              ],
            },
          },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { sid: string };
      return data.sid;
    } catch {
      return null;
    }
  }

  function isOwner(phone: string): boolean {
    // Normalize: strip whatsapp: prefix and leading +
    const cleaned = phone.replace(/^whatsapp:/, "").replace(/^\+/, "");
    const ownerCleaned = config.ownerPhone.replace(/^\+/, "");
    return cleaned === ownerCleaned;
  }

  function parseFormBody(body: string): Record<string, string> {
    const params: Record<string, string> = {};
    for (const pair of body.split("&")) {
      const [key, ...rest] = pair.split("=");
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(rest.join("="));
      }
    }
    return params;
  }

  async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Only accept POST for Twilio webhooks
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString();
    const params = parseFormBody(rawBody);

    // Validate Twilio signature
    const signature = req.headers["x-twilio-signature"];
    if (signature && typeof signature === "string") {
      const webhookUrl = `http${req.headers["x-forwarded-proto"] === "https" ? "s" : ""}://${req.headers.host}${req.url ?? "/webhook"}`;
      if (!validateTwilioSignature(config.authToken, signature, webhookUrl, params)) {
        res.writeHead(401);
        res.end();
        return;
      }
    }

    // Twilio expects quick 200 response
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end("<Response></Response>");

    const from = params.From ?? "";
    if (!isOwner(from)) return;

    const senderPhone = from.replace(/^whatsapp:/, "").replace(/^\+/, "");

    // Quick-reply button response
    const buttonPayload = params.ButtonPayload;
    if (buttonPayload) {
      if (buttonPayload === "approve" && pendingApprovalNonce) {
        const nonce = pendingApprovalNonce;
        pendingApprovalNonce = null;
        await callbacks.onApprovalResponse(nonce, true);
      } else if (buttonPayload === "deny" && pendingApprovalNonce) {
        const nonce = pendingApprovalNonce;
        pendingApprovalNonce = null;
        await callbacks.onApprovalResponse(nonce, false);
      }
      return;
    }

    // Text-based approval fallback (like Signal adapter)
    const body = params.Body ?? "";
    if (pendingApprovalNonce && (body.trim() === "1" || body.trim() === "2")) {
      const nonce = pendingApprovalNonce;
      pendingApprovalNonce = null;
      await callbacks.onApprovalResponse(nonce, body.trim() === "1");
      return;
    }

    // Media message (image)
    const numMedia = parseInt(params.NumMedia ?? "0", 10);
    if (numMedia > 0) {
      const mediaUrl = params.MediaUrl0;
      const mediaType = params.MediaContentType0 ?? "image/jpeg";

      if (mediaUrl && mediaType.startsWith("image/")) {
        try {
          const downloadRes = await fetch(mediaUrl, {
            headers: { "Authorization": auth },
          });
          if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);
          const buffer = Buffer.from(await downloadRes.arrayBuffer());

          await callbacks.onImageMessage(senderPhone, {
            buffer,
            mimeType: mediaType,
            caption: body || undefined,
          });
        } catch (err) {
          console.error("WhatsApp image download error:", err);
        }
        return;
      }

      // Audio / voice
      if (mediaUrl && mediaType.startsWith("audio/")) {
        try {
          const downloadRes = await fetch(mediaUrl, {
            headers: { "Authorization": auth },
          });
          if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);
          const buffer = Buffer.from(await downloadRes.arrayBuffer());

          await callbacks.onVoiceMessage(senderPhone, {
            buffer,
            mimeType: mediaType,
          });
        } catch (err) {
          console.error("WhatsApp audio download error:", err);
        }
        return;
      }
    }

    // Text message
    if (body) {
      await callbacks.onMessage(senderPhone, body);
    }
  }

  return {
    name: "whatsapp",
    maxMessageLength: 1600,
    supportsEdit: false,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      const sid = await sendTwilioMessage(chatId, text);
      msgCounter++;
      return sid;
    },

    async editMessage(chatId: ChatId, _ref: MessageRef, text: string): Promise<MessageRef> {
      // WhatsApp doesn't support message editing — send new message
      return this.sendMessage(chatId, text);
    },

    async sendApproval(
      chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      classification: Classification,
    ): Promise<void> {
      pendingApprovalNonce = nonce;

      const argsStr = JSON.stringify(args).slice(0, 200);
      const bodyText = [
        `*${t("messaging.approvalRequired")}* [#${nonce}]`,
        ``,
        `*${t("messaging.actionLabel")}* ${toolName}`,
        `*${t("messaging.riskLabel")}* ${classification.level} — ${classification.reason}`,
        `*${t("messaging.detailsLabel")}* ${argsStr}`,
      ].join("\n");

      // Try content template (quick-reply buttons) first
      if (contentTemplateSid) {
        try {
          await sendTwilioContentMessage(chatId, contentTemplateSid, { "1": bodyText });
          return;
        } catch {
          // Fall through to text-based fallback
        }
      }

      // Text-based fallback (like Signal)
      const fallbackText = bodyText + `\n\n${t("messaging.signalInstruction")}`;
      await sendTwilioMessage(chatId, fallbackText);
    },

    async start(): Promise<void> {
      // Try to create approval template
      contentTemplateSid = await createApprovalTemplate();

      return new Promise((resolve) => {
        server = createServer(handleWebhook);
        server.listen(config.webhookPort, () => {
          console.log(`WhatsApp webhook server started on port ${config.webhookPort}`);
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      if (server) {
        return new Promise((resolve) => {
          server!.close(() => resolve());
        });
      }
    },
  };
}
