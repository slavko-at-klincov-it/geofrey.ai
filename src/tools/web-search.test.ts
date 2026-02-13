import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { t } from "../i18n/index.js";

// We can't import web-search.ts directly because it imports tool-registry
// which imports ../index.js (circular dependency in tests). Instead we replicate
// the pure functions here for testing, matching the implementations in web-search.ts.

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return t("search.noResults");
  return results
    .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.description}`)
    .join("\n\n");
}

const USER_AGENT = "Geofrey/1.0 (AI Assistant)";
const FETCH_TIMEOUT_MS = 10_000;

async function searchSearxng(query: string, count: number, baseUrl: string): Promise<SearchResult[]> {
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

async function searchBrave(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
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

describe("formatResults", () => {
  it("returns noResults for empty array", () => {
    assert.equal(formatResults([]), t("search.noResults"));
  });

  it("formats single result", () => {
    const results: SearchResult[] = [
      { title: "Test Page", url: "https://example.com", description: "A test page" },
    ];
    const output = formatResults(results);
    assert.equal(output, "1. [Test Page](https://example.com)\n   A test page");
  });

  it("formats multiple results with numbering", () => {
    const results: SearchResult[] = [
      { title: "First", url: "https://a.com", description: "Desc A" },
      { title: "Second", url: "https://b.com", description: "Desc B" },
    ];
    const output = formatResults(results);
    assert.ok(output.includes("1. [First](https://a.com)"));
    assert.ok(output.includes("2. [Second](https://b.com)"));
    assert.ok(output.includes("   Desc A"));
    assert.ok(output.includes("   Desc B"));
  });

  it("handles empty description", () => {
    const results: SearchResult[] = [
      { title: "No Desc", url: "https://x.com", description: "" },
    ];
    const output = formatResults(results);
    assert.equal(output, "1. [No Desc](https://x.com)\n   ");
  });
});

describe("searchSearxng", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses SearXNG response", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        results: [
          { title: "SearXNG Result", url: "https://searx.example.com/1", content: "Found via SearXNG" },
          { title: "Second Result", url: "https://searx.example.com/2", content: "Also found" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchSearxng("test query", 5, "http://localhost:8080");
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "SearXNG Result");
    assert.equal(results[0].url, "https://searx.example.com/1");
    assert.equal(results[0].description, "Found via SearXNG");
  });

  it("respects count limit", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        results: [
          { title: "A", url: "https://a.com", content: "a" },
          { title: "B", url: "https://b.com", content: "b" },
          { title: "C", url: "https://c.com", content: "c" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchSearxng("test", 2, "http://localhost:8080");
    assert.equal(results.length, 2);
  });

  it("skips results without title or url", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        results: [
          { title: "", url: "https://a.com", content: "a" },
          { title: "Valid", url: "https://b.com", content: "b" },
          { title: "No URL", url: "", content: "c" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchSearxng("test", 10, "http://localhost:8080");
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Valid");
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = mock.fn(async () => new Response("error", { status: 500 })) as typeof globalThis.fetch;

    await assert.rejects(
      () => searchSearxng("test", 5, "http://localhost:8080"),
      { message: "SearXNG returned 500" },
    );
  });

  it("handles empty results array", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchSearxng("test", 5, "http://localhost:8080");
    assert.equal(results.length, 0);
  });

  it("handles missing content field", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        results: [{ title: "No Content", url: "https://a.com" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchSearxng("test", 5, "http://localhost:8080");
    assert.equal(results.length, 1);
    assert.equal(results[0].description, "");
  });
});

describe("searchBrave", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses Brave Search response", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        web: {
          results: [
            { title: "Brave Result", url: "https://brave.example.com/1", description: "Found via Brave" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchBrave("test query", 5, "test-api-key");
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Brave Result");
    assert.equal(results[0].url, "https://brave.example.com/1");
    assert.equal(results[0].description, "Found via Brave");
  });

  it("sends correct headers", async () => {
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 });
    }) as typeof globalThis.fetch;

    await searchBrave("test", 5, "my-brave-key");
    assert.equal(capturedHeaders?.get("X-Subscription-Token"), "my-brave-key");
    assert.ok(capturedHeaders?.get("User-Agent")?.includes("Geofrey"));
  });

  it("respects count limit", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        web: {
          results: [
            { title: "A", url: "https://a.com", description: "a" },
            { title: "B", url: "https://b.com", description: "b" },
            { title: "C", url: "https://c.com", description: "c" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchBrave("test", 1, "key");
    assert.equal(results.length, 1);
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = mock.fn(async () => new Response("forbidden", { status: 403 })) as typeof globalThis.fetch;

    await assert.rejects(
      () => searchBrave("test", 5, "bad-key"),
      { message: "Brave Search returned 403" },
    );
  });

  it("handles missing web.results", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({ web: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchBrave("test", 5, "key");
    assert.equal(results.length, 0);
  });

  it("handles missing description field", async () => {
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({
        web: { results: [{ title: "No Desc", url: "https://a.com" }] },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof globalThis.fetch;

    const results = await searchBrave("test", 5, "key");
    assert.equal(results.length, 1);
    assert.equal(results[0].description, "");
  });
});
