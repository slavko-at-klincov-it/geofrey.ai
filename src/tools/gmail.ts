/**
 * Gmail tool — read, send, search, label, delete emails via the orchestrator.
 * Risk levels: auth=L1, read/search=L0, send/label=L1, delete=L2.
 */

import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  type GoogleAuthConfig,
  type TokenStore,
  getValidToken,
  startOAuthFlow,
  ALL_SCOPES,
} from "../integrations/google/auth.js";
import {
  listMessages,
  getMessage,
  sendMessage,
  searchMessages,
  modifyLabels,
  deleteMessage,
  formatMessage,
} from "../integrations/google/gmail.js";

// ── Module State ────────────────────────────────────────────────────────────

let authConfig: GoogleAuthConfig | null = null;

/**
 * Initialize the Gmail tool with Google OAuth config.
 * Must be called before using any Gmail tool actions.
 */
export function initGmailTool(config: GoogleAuthConfig): void {
  authConfig = config;
}

/**
 * Get the current auth config (for testing).
 */
export function getGmailAuthConfig(): GoogleAuthConfig | null {
  return authConfig;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireToken(chatId: string): Promise<string> {
  if (!authConfig) {
    throw new Error("Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  const token = await getValidToken(authConfig, chatId);
  if (!token) {
    throw new Error("Not authenticated — use action 'auth' first to connect your Google account");
  }
  return token;
}

// ── Tool Registration ───────────────────────────────────────────────────────

registerTool({
  name: "gmail",
  description: "Gmail integration: authenticate, read, send, search, label, or delete emails. Actions: auth (start OAuth), read (search & read emails), send (send email), label (add/remove labels), delete (permanently delete email).",
  parameters: z.object({
    action: z.enum(["auth", "read", "send", "search", "label", "delete"]),
    query: z.string().optional().describe("Gmail search query for read/search (e.g. 'from:user@example.com is:unread')"),
    maxResults: z.number().int().positive().max(50).optional().describe("Max results for read/search (default 5)"),
    to: z.string().optional().describe("Recipient email address (required for send)"),
    subject: z.string().optional().describe("Email subject (required for send)"),
    body: z.string().optional().describe("Email body text (required for send)"),
    messageId: z.string().optional().describe("Message ID (required for label/delete)"),
    addLabels: z.array(z.string()).optional().describe("Label IDs to add (for label action)"),
    removeLabels: z.array(z.string()).optional().describe("Label IDs to remove (for label action)"),
    chatId: z.string().optional().describe("Chat ID for OAuth context"),
  }),
  source: "native",
  execute: async ({ action, query, maxResults, to, subject, body, messageId, addLabels, removeLabels, chatId }) => {
    const effectiveChatId = chatId ?? "default";

    switch (action) {
      case "auth": {
        if (!authConfig) {
          return "Error: Gmail not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env";
        }

        // Check if already authenticated
        const existing = await getValidToken(authConfig, effectiveChatId);
        if (existing) {
          return "Already authenticated with Google. Use 'read' or 'search' to access emails.";
        }

        try {
          const { authUrl } = startOAuthFlow(authConfig, effectiveChatId, ALL_SCOPES);
          return `Open this URL to authorize Gmail access:\n\n${authUrl}\n\nThe authorization will complete automatically once you approve access.`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error starting OAuth flow: ${msg}`;
        }
      }

      case "read": {
        try {
          const token = await requireToken(effectiveChatId);
          const limit = maxResults ?? 5;
          const messages = await searchMessages(token, query ?? "", limit);

          if (messages.length === 0) {
            return query
              ? `No emails found matching "${query}"`
              : "No emails found";
          }

          const formatted = messages.map(formatMessage).join("\n\n---\n\n");
          return `${messages.length} email(s) found:\n\n${formatted}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error reading emails: ${msg}`;
        }
      }

      case "search": {
        try {
          const token = await requireToken(effectiveChatId);
          if (!query) return "Error: 'query' is required for search";

          const limit = maxResults ?? 10;
          const result = await listMessages(token, query, limit);

          if (result.messages.length === 0) {
            return `No emails found matching "${query}"`;
          }

          // Fetch summaries for each message
          const summaries: string[] = [];
          for (const { id } of result.messages) {
            const msg = await getMessage(token, id);
            summaries.push(
              `[${msg.id}] ${msg.headers.date} | From: ${msg.headers.from} | Subject: ${msg.headers.subject}`,
            );
          }

          return `${result.messages.length} result(s) (est. ${result.resultSizeEstimate} total):\n${summaries.join("\n")}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error searching emails: ${msg}`;
        }
      }

      case "send": {
        if (!to) return "Error: 'to' is required for send";
        if (!subject) return "Error: 'subject' is required for send";
        if (!body) return "Error: 'body' is required for send";

        try {
          const token = await requireToken(effectiveChatId);
          const result = await sendMessage(token, to, subject, body);
          return `Email sent successfully (ID: ${result.id})`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error sending email: ${msg}`;
        }
      }

      case "label": {
        if (!messageId) return "Error: 'messageId' is required for label";
        if (!addLabels?.length && !removeLabels?.length) {
          return "Error: at least one of 'addLabels' or 'removeLabels' is required";
        }

        try {
          const token = await requireToken(effectiveChatId);
          const result = await modifyLabels(
            token,
            messageId,
            addLabels ?? [],
            removeLabels ?? [],
          );
          return `Labels updated for message ${result.id}. Current labels: ${result.labelIds.join(", ") || "(none)"}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error modifying labels: ${msg}`;
        }
      }

      case "delete": {
        if (!messageId) return "Error: 'messageId' is required for delete";

        try {
          const token = await requireToken(effectiveChatId);
          await deleteMessage(token, messageId);
          return `Email permanently deleted (ID: ${messageId})`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error deleting email: ${msg}`;
        }
      }
    }
  },
});
