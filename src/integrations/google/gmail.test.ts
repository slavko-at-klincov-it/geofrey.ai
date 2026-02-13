import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  listMessages,
  getMessage,
  sendMessage,
  searchMessages,
  modifyLabels,
  deleteMessage,
  formatMessage,
  decodeBase64Url,
  encodeBase64Url,
  stripHtmlTags,
  buildRfc2822Message,
  type GmailMessage,
} from "./gmail.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const TOKEN = "ya29.test-token";

function mockFetchJson(body: unknown, status: number = 200): typeof fetch {
  return mock.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function mockFetchEmpty(status: number = 204): typeof fetch {
  return mock.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    text: async () => "",
  })) as unknown as typeof fetch;
}

function mockFetchError(status: number, body: string): typeof fetch {
  return mock.fn(async () => ({
    ok: false,
    status,
    text: async () => body,
  })) as unknown as typeof fetch;
}

// ── Base64 URL encoding/decoding ────────────────────────────────────────────

describe("decodeBase64Url", () => {
  it("decodes standard base64url string", () => {
    const encoded = Buffer.from("Hello, World!").toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    assert.equal(decodeBase64Url(encoded), "Hello, World!");
  });

  it("decodes UTF-8 content", () => {
    const encoded = Buffer.from("Hallo Welt! Umlaute: äöüß").toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    assert.equal(decodeBase64Url(encoded), "Hallo Welt! Umlaute: äöüß");
  });

  it("handles empty string", () => {
    assert.equal(decodeBase64Url(""), "");
  });
});

describe("encodeBase64Url", () => {
  it("encodes to base64url (no padding)", () => {
    const result = encodeBase64Url("Hello, World!");
    assert.ok(!result.includes("+"));
    assert.ok(!result.includes("/"));
    assert.ok(!result.includes("="));
  });

  it("roundtrips correctly", () => {
    const original = "Test message with special chars: äöü +/=";
    const encoded = encodeBase64Url(original);
    const decoded = decodeBase64Url(encoded);
    assert.equal(decoded, original);
  });
});

// ── HTML stripping ──────────────────────────────────────────────────────────

describe("stripHtmlTags", () => {
  it("strips basic HTML tags", () => {
    assert.equal(stripHtmlTags("<p>Hello</p>"), "Hello");
  });

  it("converts <br> to newline", () => {
    assert.equal(stripHtmlTags("Line 1<br>Line 2"), "Line 1\nLine 2");
    assert.equal(stripHtmlTags("Line 1<br/>Line 2"), "Line 1\nLine 2");
    assert.equal(stripHtmlTags("Line 1<br />Line 2"), "Line 1\nLine 2");
  });

  it("converts closing </p> to double newline", () => {
    const result = stripHtmlTags("<p>Para 1</p><p>Para 2</p>");
    assert.ok(result.includes("Para 1"));
    assert.ok(result.includes("Para 2"));
  });

  it("decodes HTML entities", () => {
    assert.equal(stripHtmlTags("&amp; &lt; &gt; &quot; &#39;"), "& < > \" '");
  });

  it("handles nested tags", () => {
    assert.equal(stripHtmlTags("<div><span><b>Bold</b></span></div>"), "Bold");
  });

  it("collapses multiple newlines", () => {
    const result = stripHtmlTags("<p>A</p><p></p><p>B</p>");
    assert.ok(!result.includes("\n\n\n"));
  });

  it("returns empty string for empty input", () => {
    assert.equal(stripHtmlTags(""), "");
  });
});

// ── RFC 2822 message building ───────────────────────────────────────────────

describe("buildRfc2822Message", () => {
  it("builds a valid RFC 2822 message", () => {
    const msg = buildRfc2822Message("to@example.com", "Test Subject", "Hello body");
    assert.ok(msg.includes("To: to@example.com"));
    assert.ok(msg.includes("Subject: Test Subject"));
    assert.ok(msg.includes("MIME-Version: 1.0"));
    assert.ok(msg.includes("Content-Type: text/plain; charset=utf-8"));
  });

  it("includes From header when provided", () => {
    const msg = buildRfc2822Message("to@example.com", "Sub", "Body", "from@example.com");
    assert.ok(msg.includes("From: from@example.com"));
  });

  it("omits From header when not provided", () => {
    const msg = buildRfc2822Message("to@example.com", "Sub", "Body");
    assert.ok(!msg.includes("From:"));
  });

  it("base64-encodes the body", () => {
    const msg = buildRfc2822Message("to@example.com", "Sub", "Hello World");
    const bodyB64 = Buffer.from("Hello World").toString("base64");
    assert.ok(msg.includes(bodyB64));
  });
});

// ── listMessages ────────────────────────────────────────────────────────────

describe("listMessages", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("lists message IDs", async () => {
    globalThis.fetch = mockFetchJson({
      messages: [
        { id: "msg-1", threadId: "thread-1" },
        { id: "msg-2", threadId: "thread-2" },
      ],
      resultSizeEstimate: 2,
    });

    const result = await listMessages(TOKEN);
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].id, "msg-1");
    assert.equal(result.resultSizeEstimate, 2);
  });

  it("passes query parameter", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({ messages: [], resultSizeEstimate: 0 }),
      };
    }) as unknown as typeof fetch;

    await listMessages(TOKEN, "from:test@example.com is:unread", 5);
    assert.ok(capturedUrl.includes("q="));
    assert.ok(capturedUrl.includes("maxResults=5"));
  });

  it("returns empty array when no messages", async () => {
    globalThis.fetch = mockFetchJson({ resultSizeEstimate: 0 });

    const result = await listMessages(TOKEN, "nonexistent");
    assert.equal(result.messages.length, 0);
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(401, "Unauthorized");

    await assert.rejects(
      () => listMessages(TOKEN),
      (err: Error) => {
        assert.ok(err.message.includes("401"));
        return true;
      },
    );
  });
});

// ── getMessage ──────────────────────────────────────────────────────────────

describe("getMessage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("parses a full message with text/plain body", async () => {
    const bodyData = encodeBase64Url("Hello from the email body");
    globalThis.fetch = mockFetchJson({
      id: "msg-1",
      threadId: "thread-1",
      snippet: "Hello from the email...",
      labelIds: ["INBOX", "UNREAD"],
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: "Test Email" },
          { name: "Date", value: "Mon, 10 Mar 2026 10:00:00 +0100" },
        ],
        mimeType: "text/plain",
        body: { data: bodyData, size: 25 },
      },
    });

    const msg = await getMessage(TOKEN, "msg-1");
    assert.equal(msg.id, "msg-1");
    assert.equal(msg.headers.from, "sender@example.com");
    assert.equal(msg.headers.subject, "Test Email");
    assert.equal(msg.body, "Hello from the email body");
    assert.deepEqual(msg.labelIds, ["INBOX", "UNREAD"]);
  });

  it("extracts text/plain from multipart message", async () => {
    const plainData = encodeBase64Url("Plain text content");
    const htmlData = encodeBase64Url("<p>HTML content</p>");

    globalThis.fetch = mockFetchJson({
      id: "msg-2",
      threadId: "thread-2",
      snippet: "Plain text...",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "From", value: "sender@test.com" },
          { name: "To", value: "me@test.com" },
          { name: "Subject", value: "Multipart" },
          { name: "Date", value: "Tue, 11 Mar 2026 12:00:00 +0100" },
        ],
        mimeType: "multipart/alternative",
        body: { size: 0 },
        parts: [
          { mimeType: "text/plain", body: { data: plainData } },
          { mimeType: "text/html", body: { data: htmlData } },
        ],
      },
    });

    const msg = await getMessage(TOKEN, "msg-2");
    assert.equal(msg.body, "Plain text content");
  });

  it("falls back to text/html when no text/plain", async () => {
    const htmlData = encodeBase64Url("<p>HTML only</p>");

    globalThis.fetch = mockFetchJson({
      id: "msg-3",
      threadId: "thread-3",
      snippet: "HTML only",
      labelIds: [],
      payload: {
        headers: [
          { name: "From", value: "sender@test.com" },
          { name: "Subject", value: "HTML Only" },
        ],
        mimeType: "multipart/alternative",
        body: { size: 0 },
        parts: [
          { mimeType: "text/html", body: { data: htmlData } },
        ],
      },
    });

    const msg = await getMessage(TOKEN, "msg-3");
    assert.equal(msg.body, "HTML only");
  });

  it("handles missing headers gracefully", async () => {
    globalThis.fetch = mockFetchJson({
      id: "msg-4",
      threadId: "thread-4",
      snippet: "",
      labelIds: [],
      payload: {
        headers: [],
        mimeType: "text/plain",
        body: { data: encodeBase64Url("body"), size: 4 },
      },
    });

    const msg = await getMessage(TOKEN, "msg-4");
    assert.equal(msg.headers.from, "");
    assert.equal(msg.headers.subject, "");
  });
});

// ── sendMessage ─────────────────────────────────────────────────────────────

describe("sendMessage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("sends an email and returns result", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          id: "sent-1",
          threadId: "thread-new",
          labelIds: ["SENT"],
        }),
      };
    }) as unknown as typeof fetch;

    const result = await sendMessage(TOKEN, "to@example.com", "Subject", "Body text");

    assert.equal(result.id, "sent-1");
    assert.deepEqual(result.labelIds, ["SENT"]);

    // Verify the request body contains a base64url-encoded raw message
    const parsed = JSON.parse(capturedBody);
    assert.ok(typeof parsed.raw === "string");
    assert.ok(parsed.raw.length > 0);
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(403, "Sending not allowed");

    await assert.rejects(
      () => sendMessage(TOKEN, "to@example.com", "Sub", "Body"),
      (err: Error) => {
        assert.ok(err.message.includes("403"));
        return true;
      },
    );
  });
});

// ── modifyLabels ────────────────────────────────────────────────────────────

describe("modifyLabels", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("modifies labels on a message", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          id: "msg-1",
          labelIds: ["INBOX", "STARRED"],
        }),
      };
    }) as unknown as typeof fetch;

    const result = await modifyLabels(TOKEN, "msg-1", ["STARRED"], ["UNREAD"]);

    assert.equal(result.id, "msg-1");
    assert.deepEqual(result.labelIds, ["INBOX", "STARRED"]);

    const body = JSON.parse(capturedBody);
    assert.deepEqual(body.addLabelIds, ["STARRED"]);
    assert.deepEqual(body.removeLabelIds, ["UNREAD"]);
  });
});

// ── deleteMessage ───────────────────────────────────────────────────────────

describe("deleteMessage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("deletes a message", async () => {
    let capturedMethod = "";
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = String(url);
      capturedMethod = opts?.method ?? "GET";
      return { ok: true, json: async () => ({}), text: async () => "" };
    }) as unknown as typeof fetch;

    await deleteMessage(TOKEN, "msg-delete-1");

    assert.equal(capturedMethod, "DELETE");
    assert.ok(capturedUrl.includes("/messages/msg-delete-1"));
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(404, "Not found");

    await assert.rejects(
      () => deleteMessage(TOKEN, "nonexistent"),
      (err: Error) => {
        assert.ok(err.message.includes("404"));
        return true;
      },
    );
  });
});

// ── formatMessage ───────────────────────────────────────────────────────────

describe("formatMessage", () => {
  it("formats a message into readable text", () => {
    const msg: GmailMessage = {
      id: "msg-1",
      threadId: "thread-1",
      snippet: "Preview...",
      headers: {
        from: "sender@example.com",
        to: "me@example.com",
        subject: "Test Email",
        date: "Mon, 10 Mar 2026 10:00:00 +0100",
      },
      body: "Full email body here.",
      labelIds: ["INBOX", "UNREAD"],
    };

    const formatted = formatMessage(msg);
    assert.ok(formatted.includes("ID: msg-1"));
    assert.ok(formatted.includes("From: sender@example.com"));
    assert.ok(formatted.includes("Subject: Test Email"));
    assert.ok(formatted.includes("Full email body here."));
    assert.ok(formatted.includes("INBOX, UNREAD"));
  });

  it("uses snippet when body is empty", () => {
    const msg: GmailMessage = {
      id: "msg-2",
      threadId: "thread-2",
      snippet: "Snippet fallback",
      headers: { from: "", to: "", subject: "", date: "" },
      body: "",
      labelIds: [],
    };

    const formatted = formatMessage(msg);
    assert.ok(formatted.includes("Snippet fallback"));
  });

  it("shows (empty body) when both body and snippet empty", () => {
    const msg: GmailMessage = {
      id: "msg-3",
      threadId: "thread-3",
      snippet: "",
      headers: { from: "", to: "", subject: "", date: "" },
      body: "",
      labelIds: [],
    };

    const formatted = formatMessage(msg);
    assert.ok(formatted.includes("(empty body)"));
  });

  it("shows (none) when no labels", () => {
    const msg: GmailMessage = {
      id: "msg-4",
      threadId: "thread-4",
      snippet: "",
      headers: { from: "", to: "", subject: "", date: "" },
      body: "body",
      labelIds: [],
    };

    const formatted = formatMessage(msg);
    assert.ok(formatted.includes("(none)"));
  });
});

// ── searchMessages ──────────────────────────────────────────────────────────

describe("searchMessages", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("returns empty array when no results", async () => {
    globalThis.fetch = mockFetchJson({ messages: [], resultSizeEstimate: 0 });

    const results = await searchMessages(TOKEN, "nonexistent query");
    assert.equal(results.length, 0);
  });

  it("fetches full messages for each result", async () => {
    let callCount = 0;
    const bodyData = encodeBase64Url("body text");

    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      callCount++;
      const urlStr = String(url);

      // First call: list
      if (urlStr.includes("/messages?")) {
        return {
          ok: true,
          json: async () => ({
            messages: [{ id: "msg-1", threadId: "t1" }],
            resultSizeEstimate: 1,
          }),
        };
      }

      // Second call: get message
      return {
        ok: true,
        json: async () => ({
          id: "msg-1",
          threadId: "t1",
          snippet: "snippet",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "From", value: "sender@test.com" },
              { name: "Subject", value: "Search Result" },
            ],
            mimeType: "text/plain",
            body: { data: bodyData },
          },
        }),
      };
    }) as unknown as typeof fetch;

    const results = await searchMessages(TOKEN, "from:sender@test.com", 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].headers.subject, "Search Result");
    assert.equal(callCount, 2); // list + getMessage
  });
});
