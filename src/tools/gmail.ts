import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { getGoogleConfig, getAuthUrl, exchangeCode, startOAuthCallbackServer } from "../integrations/google/auth.js";
import { listMessages, getMessage, sendMessage, labelMessage, deleteMessage } from "../integrations/google/gmail.js";
import { t } from "../i18n/index.js";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

registerTool({
  name: "gmail",
  description: "Gmail: authenticate, list, read, send, label, or delete emails.",
  parameters: z.object({
    action: z.enum(["auth", "list", "read", "send", "label", "delete"]),
    query: z.string().optional().describe("Search query (for list)"),
    messageId: z.string().optional().describe("Message ID (for read/label/delete)"),
    to: z.string().optional().describe("Recipient email (for send)"),
    subject: z.string().optional().describe("Email subject (for send)"),
    body: z.string().optional().describe("Email body (for send)"),
    addLabels: z.array(z.string()).optional().describe("Labels to add (for label)"),
    removeLabels: z.array(z.string()).optional().describe("Labels to remove (for label)"),
  }),
  source: "native",
  execute: async ({ action, query, messageId, to, subject, body, addLabels, removeLabels }) => {
    if (action !== "auth" && !getGoogleConfig()) {
      return t("gmail.notConfigured");
    }

    switch (action) {
      case "auth": {
        if (!getGoogleConfig()) return t("gmail.notConfigured");
        const authUrl = getAuthUrl(GMAIL_SCOPES);
        // Start callback server in the background
        startOAuthCallbackServer().then(async (code) => {
          try {
            await exchangeCode(code);
            console.log("Gmail: OAuth2 tokens saved");
          } catch (err) {
            console.error("Gmail: Token exchange failed:", err);
          }
        }).catch(() => { /* timeout or error, already handled */ });
        return t("gmail.authUrl", { url: authUrl });
      }

      case "list": {
        try {
          const msgs = await listMessages(query, 10);
          if (msgs.length === 0) return t("gmail.listEmpty");
          // Get details for each message
          const details = await Promise.all(
            msgs.slice(0, 10).map((m) => getMessage(m.id)),
          );
          const header = t("gmail.listHeader", { count: String(details.length) });
          const lines = details.map(
            (m) => `- [${m.id}] ${m.from}: ${m.subject}\n  ${m.snippet}`,
          );
          return `${header}\n${lines.join("\n")}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Gmail error: ${msg}`;
        }
      }

      case "read": {
        if (!messageId) return t("tools.paramRequired", { param: "messageId", action: "read" });
        try {
          const msg = await getMessage(messageId);
          return [
            `From: ${msg.from}`,
            `To: ${msg.to}`,
            `Date: ${msg.date}`,
            `Subject: ${msg.subject}`,
            `Labels: ${msg.labelIds.join(", ")}`,
            "",
            msg.body ?? msg.snippet,
          ].join("\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Gmail error: ${msg}`;
        }
      }

      case "send": {
        if (!to) return t("tools.paramRequired", { param: "to", action: "send" });
        if (!subject) return t("tools.paramRequired", { param: "subject", action: "send" });
        if (!body) return t("tools.paramRequired", { param: "body", action: "send" });
        try {
          const id = await sendMessage(to, subject, body);
          return t("gmail.sent", { to });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Gmail send error: ${msg}`;
        }
      }

      case "label": {
        if (!messageId) return t("tools.paramRequired", { param: "messageId", action: "label" });
        try {
          await labelMessage(messageId, addLabels ?? [], removeLabels ?? []);
          return t("gmail.labeled", { id: messageId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Gmail label error: ${msg}`;
        }
      }

      case "delete": {
        if (!messageId) return t("tools.paramRequired", { param: "messageId", action: "delete" });
        try {
          await deleteMessage(messageId);
          return t("gmail.deleted", { id: messageId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Gmail delete error: ${msg}`;
        }
      }

      default:
        return t("tools.unknownAction", { action: String(action) });
    }
  },
});
