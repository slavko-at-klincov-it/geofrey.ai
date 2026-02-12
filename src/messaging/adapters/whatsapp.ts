import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";

interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  ownerPhone: string;
  webhookPort: number;
}

const API_BASE = "https://graph.facebook.com/v21.0";

export function createWhatsAppPlatform(
  config: WhatsAppConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  let server: Server | null = null;
  let msgCounter = 0;

  async function callApi(endpoint: string, body: unknown): Promise<{ messages?: Array<{ id: string }> }> {
    const url = `${API_BASE}/${config.phoneNumberId}/${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WhatsApp API ${res.status}: ${text}`);
    }
    return res.json() as Promise<{ messages?: Array<{ id: string }> }>;
  }

  function isOwner(phone: string): boolean {
    // Normalize: strip leading + and compare
    const normalized = phone.replace(/^\+/, "");
    const ownerNormalized = config.ownerPhone.replace(/^\+/, "");
    return normalized === ownerNormalized;
  }

  async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Webhook verification (GET)
    if (req.method === "GET") {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === config.verifyToken) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(challenge);
      } else {
        res.writeHead(403);
        res.end();
      }
      return;
    }

    // Incoming messages (POST)
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const rawBody = Buffer.concat(chunks);

      // Validate signature if X-Hub-Signature-256 is present
      const signature = req.headers["x-hub-signature-256"];
      if (signature && typeof signature === "string") {
        const expected = "sha256=" + createHmac("sha256", config.verifyToken)
          .update(rawBody)
          .digest("hex");
        if (signature !== expected) {
          res.writeHead(401);
          res.end();
          return;
        }
      }

      res.writeHead(200);
      res.end();

      try {
        const body = JSON.parse(rawBody.toString()) as WhatsAppWebhookPayload;
        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const value = change.value;
            if (!value?.messages) continue;

            for (const msg of value.messages) {
              const senderPhone = msg.from;
              if (!isOwner(senderPhone)) continue;

              // Interactive button reply (approval response)
              if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
                const payload = msg.interactive.button_reply.id;
                if (payload.startsWith("approve:")) {
                  await callbacks.onApprovalResponse(payload.slice(8), true);
                } else if (payload.startsWith("deny:")) {
                  await callbacks.onApprovalResponse(payload.slice(5), false);
                }
                continue;
              }

              // Text message
              if (msg.type === "text" && msg.text?.body) {
                await callbacks.onMessage(senderPhone, msg.text.body);
              }
            }
          }
        }
      } catch (err) {
        console.error("WhatsApp webhook parse error:", err);
      }
      return;
    }

    res.writeHead(405);
    res.end();
  }

  return {
    name: "whatsapp",
    maxMessageLength: 4096,
    supportsEdit: false,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      const result = await callApi("messages", {
        messaging_product: "whatsapp",
        to: chatId,
        type: "text",
        text: { body: text },
      });
      msgCounter++;
      return result.messages?.[0]?.id ?? String(msgCounter);
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
      const argsStr = JSON.stringify(args).slice(0, 200);
      const bodyText = [
        `*Genehmigung erforderlich* [#${nonce}]`,
        ``,
        `*Aktion:* ${toolName}`,
        `*Risiko:* ${classification.level} — ${classification.reason}`,
        `*Details:* ${argsStr}`,
      ].join("\n");

      await callApi("messages", {
        messaging_product: "whatsapp",
        to: chatId,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: [
              { type: "reply", reply: { id: `approve:${nonce}`, title: "Genehmigen" } },
              { type: "reply", reply: { id: `deny:${nonce}`, title: "Ablehnen" } },
            ],
          },
        },
      });
    },

    async start(): Promise<void> {
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

// WhatsApp webhook payload types
interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          interactive?: {
            type: string;
            button_reply: { id: string; title: string };
          };
        }>;
      };
    }>;
  }>;
}
