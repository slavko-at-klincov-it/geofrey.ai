/**
 * Gmail API client — list, read, send, search, labels, delete.
 * Uses native fetch. Requires a valid access token from auth.ts.
 */

import { z } from "zod";

// ── Constants ───────────────────────────────────────────────────────────────

const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const FETCH_TIMEOUT_MS = 15_000;
const RATE_LIMIT_DELAY_MS = 50; // simple delay between batch calls (250 units/sec)

// ── Types ───────────────────────────────────────────────────────────────────

export interface GmailMessageHeader {
  from: string;
  to: string;
  subject: string;
  date: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  headers: GmailMessageHeader;
  body: string;
  labelIds: string[];
}

export interface GmailMessageId {
  id: string;
  threadId: string;
}

export interface GmailListResult {
  messages: GmailMessageId[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface GmailModifyResult {
  id: string;
  labelIds: string[];
}

// ── Zod schemas for API responses ───────────────────────────────────────────

const messageIdSchema = z.object({
  id: z.string(),
  threadId: z.string(),
});

const listResponseSchema = z.object({
  messages: z.array(messageIdSchema).default([]),
  nextPageToken: z.string().optional(),
  resultSizeEstimate: z.number().default(0),
});

const headerSchema = z.object({
  name: z.string(),
  value: z.string(),
});

const bodyPartSchema = z.object({
  mimeType: z.string().optional(),
  body: z.object({
    data: z.string().optional(),
    size: z.number().optional(),
  }).optional(),
  parts: z.lazy((): z.ZodType => z.array(bodyPartSchema)).optional(),
});

const messageResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  snippet: z.string().default(""),
  labelIds: z.array(z.string()).default([]),
  payload: z.object({
    headers: z.array(headerSchema).default([]),
    mimeType: z.string().optional(),
    body: z.object({
      data: z.string().optional(),
      size: z.number().optional(),
    }).optional(),
    parts: z.array(bodyPartSchema).optional(),
  }).optional(),
});

const sendResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).default([]),
});

const modifyResponseSchema = z.object({
  id: z.string(),
  labelIds: z.array(z.string()).default([]),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function gmailFetch(
  accessToken: string,
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const url = `${GMAIL_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...authHeaders(accessToken),
      ...(opts.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body}`);
  }

  return res;
}

/**
 * Decode base64url-encoded string to UTF-8 text.
 */
export function decodeBase64Url(data: string): string {
  // Convert base64url to standard base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Encode a string to base64url (no padding).
 */
export function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Strip HTML tags and decode entities for plain text extraction.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

interface MimePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MimePart[];
}

/**
 * Recursively extract text/plain or text/html body from MIME parts.
 * Prefers text/plain over text/html.
 */
function extractBody(payload: { mimeType?: string; body?: { data?: string; size?: number }; parts?: MimePart[] } | undefined): string {
  if (!payload) return "";

  // Simple message with direct body
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      return stripHtmlTags(decoded);
    }
    return decoded;
  }

  // Multipart message — search parts recursively
  if (payload.parts) {
    // First pass: look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Second pass: look for text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtmlTags(decodeBase64Url(part.body.data));
      }
    }
    // Recursive: check nested parts (multipart/alternative, multipart/mixed)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody({
          mimeType: part.mimeType,
          body: part.body,
          parts: part.parts,
        });
        if (nested) return nested;
      }
    }
  }

  return "";
}

/**
 * Build an RFC 2822 email message.
 */
export function buildRfc2822Message(to: string, subject: string, body: string, from?: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (from) {
    lines.unshift(`From: ${from}`);
  }
  lines.push(""); // empty line separating headers from body
  lines.push(Buffer.from(body, "utf-8").toString("base64"));
  return lines.join("\r\n");
}

// ── API Functions ───────────────────────────────────────────────────────────

/**
 * List message IDs matching a query.
 * Uses Gmail search syntax (from:, subject:, is:unread, after:, before:).
 */
export async function listMessages(
  accessToken: string,
  query?: string,
  maxResults: number = 10,
): Promise<GmailListResult> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) {
    params.set("q", query);
  }

  const res = await gmailFetch(accessToken, `/messages?${params.toString()}`);
  const data = await res.json();
  return listResponseSchema.parse(data);
}

/**
 * Get full message by ID.
 */
export async function getMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage> {
  const res = await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
  const data = await res.json();
  const parsed = messageResponseSchema.parse(data);

  const headers: GmailMessageHeader = {
    from: extractHeader(parsed.payload?.headers ?? [], "From"),
    to: extractHeader(parsed.payload?.headers ?? [], "To"),
    subject: extractHeader(parsed.payload?.headers ?? [], "Subject"),
    date: extractHeader(parsed.payload?.headers ?? [], "Date"),
  };

  const body = extractBody(parsed.payload);

  return {
    id: parsed.id,
    threadId: parsed.threadId,
    snippet: parsed.snippet,
    headers,
    body,
    labelIds: parsed.labelIds,
  };
}

/**
 * Send an email message.
 */
export async function sendMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<GmailSendResult> {
  const raw = buildRfc2822Message(to, subject, body);
  const encoded = encodeBase64Url(raw);

  const res = await gmailFetch(accessToken, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });

  const data = await res.json();
  return sendResponseSchema.parse(data);
}

/**
 * Search messages using Gmail search syntax.
 * Convenience wrapper that fetches full messages (not just IDs).
 */
export async function searchMessages(
  accessToken: string,
  query: string,
  maxResults: number = 5,
): Promise<GmailMessage[]> {
  const list = await listMessages(accessToken, query, maxResults);
  const messages: GmailMessage[] = [];

  for (const { id } of list.messages) {
    // Simple rate limiting
    if (messages.length > 0) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
    const msg = await getMessage(accessToken, id);
    messages.push(msg);
  }

  return messages;
}

/**
 * Add or remove labels from a message.
 */
export async function modifyLabels(
  accessToken: string,
  messageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = [],
): Promise<GmailModifyResult> {
  const res = await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds,
      removeLabelIds,
    }),
  });

  const data = await res.json();
  return modifyResponseSchema.parse(data);
}

/**
 * Permanently delete a message. This cannot be undone.
 */
export async function deleteMessage(
  accessToken: string,
  messageId: string,
): Promise<void> {
  await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

// ── Utilities ───────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a GmailMessage into a readable string for the orchestrator.
 */
export function formatMessage(msg: GmailMessage): string {
  const lines = [
    `ID: ${msg.id}`,
    `From: ${msg.headers.from}`,
    `To: ${msg.headers.to}`,
    `Subject: ${msg.headers.subject}`,
    `Date: ${msg.headers.date}`,
    `Labels: ${msg.labelIds.join(", ") || "(none)"}`,
    "",
    msg.body || msg.snippet || "(empty body)",
  ];
  return lines.join("\n");
}
