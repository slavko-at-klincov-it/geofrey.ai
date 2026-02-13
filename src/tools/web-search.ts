import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { t } from "../i18n/index.js";

const USER_AGENT = "Geofrey/1.0 (AI Assistant)";
const FETCH_TIMEOUT_MS = 10_000;

export interface SearchConfig {
  provider: string;
  searxngUrl: string;
  braveApiKey?: string;
}

let searchConfig: SearchConfig | null = null;

export function setSearchConfig(config: SearchConfig): void {
  searchConfig = config;
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return t("search.noResults");
  return results
    .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.description}`)
    .join("\n\n");
}

export async function searchSearxng(query: string, count: number, baseUrl: string): Promise<SearchResult[]> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`SearXNG returned ${res.status}`);
  }

  const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const results: SearchResult[] = [];

  for (const item of data.results ?? []) {
    if (results.length >= count) break;
    if (item.title && item.url) {
      results.push({
        title: item.title,
        url: item.url,
        description: item.content ?? "",
      });
    }
  }

  return results;
}

export async function searchBrave(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Brave Search returned ${res.status}`);
  }

  const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const results: SearchResult[] = [];

  for (const item of data.web?.results ?? []) {
    if (results.length >= count) break;
    if (item.title && item.url) {
      results.push({
        title: item.title,
        url: item.url,
        description: item.description ?? "",
      });
    }
  }

  return results;
}

registerTool({
  name: "web_search",
  description: "Search the web using SearXNG or Brave Search",
  parameters: z.object({
    query: z.string().min(1),
    count: z.number().int().positive().default(5),
  }),
  source: "native",
  execute: async ({ query, count }) => {
    if (!searchConfig) {
      throw new Error("Search config not initialized — call setSearchConfig() first");
    }

    try {
      let results: SearchResult[];

      if (searchConfig.provider === "brave") {
        if (!searchConfig.braveApiKey) {
          throw new Error("BRAVE_API_KEY is required for Brave Search provider");
        }
        results = await searchBrave(query, count ?? 5, searchConfig.braveApiKey);
      } else {
        results = await searchSearxng(query, count ?? 5, searchConfig.searxngUrl);
      }

      return formatResults(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return t("search.providerError", { msg });
    }
  },
});
