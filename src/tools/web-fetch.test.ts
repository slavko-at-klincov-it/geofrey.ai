import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { t } from "../i18n/index.js";

// We can't import web-fetch.ts directly because it imports tool-registry
// which imports ../index.js (circular dependency in tests). Instead we replicate
// the pure functions here for testing, matching the implementations in web-fetch.ts.

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => HTML_ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove script, style, nav, footer, header, aside tags and their content
  md = md.replace(/<script[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  md = md.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  md = md.replace(/<header[\s\S]*?<\/header>/gi, "");
  md = md.replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Convert <pre> blocks to triple-backtick code blocks (before other transforms)
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, content) => {
    const clean = content.replace(/<[^>]+>/g, "");
    return `\n\`\`\`\n${decodeEntities(clean).trim()}\n\`\`\`\n`;
  });

  // Convert headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `\n###### ${c.replace(/<[^>]+>/g, "").trim()}\n`);

  // Convert paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, c) => `\n\n${c.trim()}\n\n`);

  // Convert links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    return `[${cleanText}](${href})`;
  });

  // Convert strong/bold
  md = md.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, c) => `**${c}**`);

  // Convert em/italic
  md = md.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, c) => `*${c}*`);

  // Convert inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => `\`${c}\``);

  // Convert list items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${c.replace(/<[^>]+>/g, "").trim()}\n`);

  // Convert <br> to newline
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Strip all remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = decodeEntities(md);

  // Collapse multiple newlines to max 2
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

// Replicated web_fetch execute logic for testing
const USER_AGENT = "Geofrey/1.0 (AI Assistant)";
const FETCH_TIMEOUT_MS = 10_000;

async function webFetchExecute({ url, maxLength }: { url: string; maxLength: number }): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) {
      return t("search.fetchFailed", { url: `${url} (${res.status})` });
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return t("search.fetchFailed", { url: `${url} (unsupported content-type: ${contentType})` });
    }

    const html = await res.text();
    const markdown = htmlToMarkdown(html);

    if (markdown.length > maxLength) {
      return markdown.slice(0, maxLength) + "\n\n[... truncated]";
    }

    return markdown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return t("search.fetchFailed", { url: `${url} (${msg})` });
  }
}

describe("htmlToMarkdown", () => {
  it("converts h1-h6 headings", () => {
    assert.ok(htmlToMarkdown("<h1>Title</h1>").includes("# Title"));
    assert.ok(htmlToMarkdown("<h2>Subtitle</h2>").includes("## Subtitle"));
    assert.ok(htmlToMarkdown("<h3>Section</h3>").includes("### Section"));
    assert.ok(htmlToMarkdown("<h4>Sub</h4>").includes("#### Sub"));
    assert.ok(htmlToMarkdown("<h5>Minor</h5>").includes("##### Minor"));
    assert.ok(htmlToMarkdown("<h6>Tiny</h6>").includes("###### Tiny"));
  });

  it("converts links", () => {
    const md = htmlToMarkdown('<a href="https://example.com">Click here</a>');
    assert.ok(md.includes("[Click here](https://example.com)"));
  });

  it("converts bold/strong", () => {
    assert.ok(htmlToMarkdown("<strong>bold</strong>").includes("**bold**"));
    assert.ok(htmlToMarkdown("<b>bold</b>").includes("**bold**"));
  });

  it("converts italic/em", () => {
    assert.ok(htmlToMarkdown("<em>italic</em>").includes("*italic*"));
    assert.ok(htmlToMarkdown("<i>italic</i>").includes("*italic*"));
  });

  it("converts inline code", () => {
    assert.ok(htmlToMarkdown("<code>const x = 1</code>").includes("`const x = 1`"));
  });

  it("converts pre blocks to fenced code", () => {
    const md = htmlToMarkdown("<pre>function hello() {}</pre>");
    assert.ok(md.includes("```"));
    assert.ok(md.includes("function hello() {}"));
  });

  it("converts pre with inner code tags", () => {
    const md = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
    assert.ok(md.includes("```"));
    assert.ok(md.includes("const x = 1;"));
  });

  it("converts list items", () => {
    const md = htmlToMarkdown("<ul><li>First</li><li>Second</li></ul>");
    assert.ok(md.includes("- First"));
    assert.ok(md.includes("- Second"));
  });

  it("converts br tags to newlines", () => {
    const md = htmlToMarkdown("line1<br>line2<br/>line3<br />line4");
    assert.ok(md.includes("line1\nline2\nline3\nline4"));
  });

  it("converts paragraphs to double newlines", () => {
    const md = htmlToMarkdown("<p>First paragraph</p><p>Second paragraph</p>");
    assert.ok(md.includes("First paragraph"));
    assert.ok(md.includes("Second paragraph"));
  });

  it("strips script tags and content", () => {
    const md = htmlToMarkdown('<p>Hello</p><script>alert("xss")</script><p>World</p>');
    assert.ok(!md.includes("script"));
    assert.ok(!md.includes("alert"));
    assert.ok(md.includes("Hello"));
    assert.ok(md.includes("World"));
  });

  it("strips style tags and content", () => {
    const md = htmlToMarkdown("<style>body { color: red; }</style><p>Content</p>");
    assert.ok(!md.includes("color"));
    assert.ok(md.includes("Content"));
  });

  it("strips nav tags and content", () => {
    const md = htmlToMarkdown("<nav><a href='/'>Home</a></nav><p>Main content</p>");
    assert.ok(!md.includes("Home"));
    assert.ok(md.includes("Main content"));
  });

  it("strips footer tags and content", () => {
    const md = htmlToMarkdown("<p>Content</p><footer>Copyright 2026</footer>");
    assert.ok(!md.includes("Copyright"));
    assert.ok(md.includes("Content"));
  });

  it("strips header tags and content", () => {
    const md = htmlToMarkdown("<header><h1>Site Title</h1></header><p>Body</p>");
    assert.ok(!md.includes("Site Title"));
    assert.ok(md.includes("Body"));
  });

  it("strips aside tags and content", () => {
    const md = htmlToMarkdown("<aside>Sidebar</aside><p>Main</p>");
    assert.ok(!md.includes("Sidebar"));
    assert.ok(md.includes("Main"));
  });

  it("strips remaining HTML tags", () => {
    const md = htmlToMarkdown('<div class="wrapper"><span>Text</span></div>');
    assert.ok(!md.includes("<div"));
    assert.ok(!md.includes("<span"));
    assert.ok(md.includes("Text"));
  });

  it("collapses multiple newlines to max 2", () => {
    const md = htmlToMarkdown("<p>A</p>\n\n\n\n\n<p>B</p>");
    const maxConsecutive = md.match(/\n{3,}/);
    assert.equal(maxConsecutive, null);
  });

  it("handles headings with inner tags", () => {
    const md = htmlToMarkdown("<h2><a href='#'>Link Title</a></h2>");
    assert.ok(md.includes("## Link Title"));
  });
});

describe("decodeEntities", () => {
  it("decodes &amp;", () => {
    assert.equal(decodeEntities("&amp;"), "&");
  });

  it("decodes &lt; and &gt;", () => {
    assert.equal(decodeEntities("&lt;div&gt;"), "<div>");
  });

  it("decodes &quot;", () => {
    assert.equal(decodeEntities("&quot;hello&quot;"), '"hello"');
  });

  it("decodes &#39;", () => {
    assert.equal(decodeEntities("&#39;hi&#39;"), "'hi'");
  });

  it("decodes &nbsp;", () => {
    assert.equal(decodeEntities("hello&nbsp;world"), "hello world");
  });

  it("decodes numeric character references", () => {
    assert.equal(decodeEntities("&#65;"), "A");
    assert.equal(decodeEntities("&#97;"), "a");
  });

  it("decodes hex character references", () => {
    assert.equal(decodeEntities("&#x41;"), "A");
    assert.equal(decodeEntities("&#x61;"), "a");
  });

  it("leaves unknown entities unchanged", () => {
    assert.equal(decodeEntities("&unknown;"), "&unknown;");
  });
});

describe("webFetchExecute", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and converts HTML to markdown", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      "<html><body><h1>Hello</h1><p>World</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html" } },
    )) as typeof globalThis.fetch;

    const result = await webFetchExecute({ url: "https://example.com", maxLength: 5000 });
    assert.ok(result.includes("# Hello"));
    assert.ok(result.includes("World"));
  });

  it("truncates to maxLength", async () => {
    const longContent = "<p>" + "A".repeat(200) + "</p>";
    globalThis.fetch = mock.fn(async () => new Response(
      longContent,
      { status: 200, headers: { "Content-Type": "text/html" } },
    )) as typeof globalThis.fetch;

    const result = await webFetchExecute({ url: "https://example.com", maxLength: 50 });
    assert.ok(result.length <= 70); // 50 + "[... truncated]" text
    assert.ok(result.includes("[... truncated]"));
  });

  it("returns error for non-OK response", async () => {
    globalThis.fetch = mock.fn(async () => new Response("Not Found", { status: 404 })) as typeof globalThis.fetch;

    const result = await webFetchExecute({ url: "https://example.com/missing", maxLength: 5000 });
    assert.ok(result.includes("404"));
  });

  it("returns error for unsupported content type", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      new Uint8Array([0x89, 0x50]),
      { status: 200, headers: { "Content-Type": "image/png" } },
    )) as typeof globalThis.fetch;

    const result = await webFetchExecute({ url: "https://example.com/image.png", maxLength: 5000 });
    assert.ok(result.includes("unsupported content-type"));
  });

  it("handles fetch errors gracefully", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("network timeout");
    }) as typeof globalThis.fetch;

    const result = await webFetchExecute({ url: "https://unreachable.example.com", maxLength: 5000 });
    assert.ok(result.includes("network timeout"));
  });

  it("accepts text/plain content type", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      "Plain text content",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    )) as typeof globalThis.fetch;

    const result = await webFetchExecute({ url: "https://example.com/file.txt", maxLength: 5000 });
    assert.ok(result.includes("Plain text content"));
  });
});
