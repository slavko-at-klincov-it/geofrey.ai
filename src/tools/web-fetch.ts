import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { t } from "../i18n/index.js";
import { sanitizeMcpOutput } from "./mcp-client.js";

const USER_AGENT = "Geofrey/1.0 (AI Assistant)";
const FETCH_TIMEOUT_MS = 10_000;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => HTML_ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function htmlToMarkdown(html: string): string {
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
    // Strip inner tags like <code>
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

registerTool({
  name: "web_fetch",
  description: "Fetch a URL and extract readable content as Markdown",
  parameters: z.object({
    url: z.string().url(),
    maxLength: z.number().int().positive().default(5000),
  }),
  source: "native",
  execute: async ({ url, maxLength }) => {
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

      const limit = maxLength ?? 5000;
      const trimmed = markdown.length > limit
        ? markdown.slice(0, limit) + "\n\n[... truncated]"
        : markdown;

      // Sanitize web content for prompt injection (same as MCP output)
      return sanitizeMcpOutput(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return t("search.fetchFailed", { url: `${url} (${msg})` });
    }
  },
});
