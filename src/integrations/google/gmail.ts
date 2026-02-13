import { getValidToken } from "./auth.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const FETCH_TIMEOUT_MS = 15_000;

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  labelIds: string[];
}

async function gmailFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getValidToken();
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Gmail API returned ${res.status}: ${await res.text()}`);
  }
  return res;
}

/**
 * List messages matching a query.
 */
export async function listMessages(query?: string, maxResults = 10): Promise<Array<{ id: string; threadId: string }>> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set("q", query);

  const res = await gmailFetch(`/messages?${params.toString()}`);
  const data = await res.json() as { messages?: Array<{ id: string; threadId: string }> };
  return data.messages ?? [];
}

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(payload: { mimeType?: string; body?: { data?: string }; parts?: Array<any> }): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    // Prefer text/plain, fall back to text/html
    const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);

    const htmlPart = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);

    // Check nested parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return "";
}

/**
 * Get full message details.
 */
export async function getMessage(id: string): Promise<GmailMessage> {
  const res = await gmailFetch(`/messages/${id}?format=full`);
  const data = await res.json() as {
    id: string;
    threadId: string;
    snippet: string;
    labelIds?: string[];
    payload?: {
      headers?: Array<{ name: string; value: string }>;
      mimeType?: string;
      body?: { data?: string };
      parts?: Array<any>;
    };
  };

  const headers = data.payload?.headers ?? [];

  return {
    id: data.id,
    threadId: data.threadId,
    subject: extractHeader(headers, "Subject"),
    from: extractHeader(headers, "From"),
    to: extractHeader(headers, "To"),
    date: extractHeader(headers, "Date"),
    snippet: data.snippet,
    body: data.payload ? extractBody(data.payload) : undefined,
    labelIds: data.labelIds ?? [],
  };
}

/**
 * Send a new email.
 */
export async function sendMessage(to: string, subject: string, body: string): Promise<string> {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(raw).toString("base64url");

  const res = await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });

  const data = await res.json() as { id: string };
  return data.id;
}

/**
 * Modify message labels.
 */
export async function labelMessage(
  id: string,
  addLabels: string[],
  removeLabels: string[],
): Promise<boolean> {
  const res = await gmailFetch(`/messages/${id}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: addLabels,
      removeLabelIds: removeLabels,
    }),
  });

  return res.ok;
}

/**
 * Delete a message (moves to Trash).
 */
export async function deleteMessage(id: string): Promise<boolean> {
  const res = await gmailFetch(`/messages/${id}/trash`, {
    method: "POST",
  });

  return res.ok;
}
