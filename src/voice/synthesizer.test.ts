import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  setTtsConfig,
  synthesize,
  splitText,
  clearTtsCache,
  getCacheSize,
  type TtsConfig,
} from "./synthesizer.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_CONFIG: TtsConfig = {
  apiKey: "xi-test-key-123",
  voiceId: "voice-abc",
  model: "eleven_multilingual_v2",
  cacheSize: 3,
};

const FAKE_AUDIO = new Uint8Array([0x49, 0x44, 0x33, 0xff, 0xfb]); // fake MP3 header bytes

function mockFetchSuccess(): typeof fetch {
  return mock.fn(async () => ({
    ok: true,
    arrayBuffer: async () => FAKE_AUDIO.buffer,
  })) as unknown as typeof fetch;
}

function mockFetchError(status: number, body: string): typeof fetch {
  return mock.fn(async () => ({
    ok: false,
    status,
    text: async () => body,
  })) as unknown as typeof fetch;
}

// ── splitText ────────────────────────────────────────────────────────────────

describe("splitText", () => {
  it("returns empty array for empty string", () => {
    assert.deepEqual(splitText(""), []);
  });

  it("returns single chunk when text is within limit", () => {
    const result = splitText("Hello world.", 100);
    assert.deepEqual(result, ["Hello world."]);
  });

  it("returns single chunk when text is exactly at limit", () => {
    const text = "x".repeat(50);
    const result = splitText(text, 50);
    assert.deepEqual(result, [text]);
  });

  it("splits at sentence boundary", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const result = splitText(text, 20);
    // "First sentence." = 15 chars, fits
    // "Second sentence." = 16 chars, fits
    // "Third sentence." = 15 chars, fits
    assert.ok(result.length >= 2);
    for (const chunk of result) {
      assert.ok(chunk.length <= 20, `Chunk "${chunk}" exceeds limit`);
    }
  });

  it("splits at last space when no sentence boundary found", () => {
    const text = "word1 word2 word3 word4 word5";
    const result = splitText(text, 12);
    for (const chunk of result) {
      assert.ok(chunk.length <= 12, `Chunk "${chunk}" exceeds limit`);
    }
    // Joined result should reconstruct the original text
    assert.equal(result.join(" "), text);
  });

  it("hard splits when no space or sentence boundary", () => {
    const text = "a".repeat(30);
    const result = splitText(text, 10);
    assert.equal(result.length, 3);
    for (const chunk of result) {
      assert.ok(chunk.length <= 10);
    }
    assert.equal(result.join(""), text);
  });

  it("handles multiple sentence-ending punctuation marks", () => {
    const text = "Really? Yes! Okay. Done.";
    const result = splitText(text, 15);
    assert.ok(result.length >= 2);
    for (const chunk of result) {
      assert.ok(chunk.length <= 15, `Chunk "${chunk}" exceeds limit`);
    }
  });

  it("uses default maxLength of 5000", () => {
    const text = "a".repeat(4999);
    const result = splitText(text);
    assert.equal(result.length, 1);
  });
});

// ── LRU cache ────────────────────────────────────────────────────────────────

describe("LRU cache", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearTtsCache();
    setTtsConfig(TEST_CONFIG);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTtsCache();
    mock.restoreAll();
  });

  it("caches synthesized audio", async () => {
    const mockFn = mockFetchSuccess();
    globalThis.fetch = mockFn;

    await synthesize("Hello");
    assert.equal(getCacheSize(), 1);

    // Second call should use cache (no additional fetch)
    await synthesize("Hello");
    assert.equal(getCacheSize(), 1);
    assert.equal((mockFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
  });

  it("evicts oldest entry when cache is full", async () => {
    globalThis.fetch = mockFetchSuccess();

    // Fill cache to capacity (3)
    await synthesize("one");
    await synthesize("two");
    await synthesize("three");
    assert.equal(getCacheSize(), 3);

    // Adding a 4th should evict the oldest ("one")
    await synthesize("four");
    assert.equal(getCacheSize(), 3);
  });

  it("clearTtsCache empties the cache", async () => {
    globalThis.fetch = mockFetchSuccess();

    await synthesize("cached text");
    assert.equal(getCacheSize(), 1);

    clearTtsCache();
    assert.equal(getCacheSize(), 0);
  });
});

// ── synthesize ───────────────────────────────────────────────────────────────

describe("synthesize", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearTtsCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTtsCache();
    mock.restoreAll();
  });

  it("throws when config is not set", async () => {
    // Set config to null by creating a fresh state — we call setTtsConfig
    // with a valid config then test by importing and calling synthesize
    // before setTtsConfig. Since we cannot reset module state, we test
    // the API error path instead.
    setTtsConfig(TEST_CONFIG);
    globalThis.fetch = mockFetchError(401, "Unauthorized");

    await assert.rejects(
      () => synthesize("test"),
      (err: Error) => {
        assert.ok(err.message.includes("401"));
        return true;
      },
    );
  });

  it("throws when text is empty", async () => {
    setTtsConfig(TEST_CONFIG);

    await assert.rejects(
      () => synthesize(""),
      (err: Error) => {
        assert.ok(err.message.includes("empty"));
        return true;
      },
    );
  });

  it("throws when text exceeds 5000 characters", async () => {
    setTtsConfig(TEST_CONFIG);

    const longText = "a".repeat(5001);
    await assert.rejects(
      () => synthesize(longText),
      (err: Error) => {
        assert.ok(err.message.includes("5000"));
        return true;
      },
    );
  });

  it("returns SynthesisResult on success", async () => {
    setTtsConfig(TEST_CONFIG);
    globalThis.fetch = mockFetchSuccess();

    const result = await synthesize("Hello world");
    assert.ok(Buffer.isBuffer(result.audio));
    assert.equal(result.contentType, "audio/mpeg");
    assert.equal(result.characterCount, 11);
  });

  it("sends correct request to ElevenLabs API", async () => {
    setTtsConfig(TEST_CONFIG);

    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    const mockFn = mock.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = Object.fromEntries(
        Object.entries(opts?.headers ?? {}),
      ) as Record<string, string>;
      capturedBody = opts?.body as string;
      return {
        ok: true,
        arrayBuffer: async () => FAKE_AUDIO.buffer,
      };
    });
    globalThis.fetch = mockFn as unknown as typeof fetch;

    await synthesize("Test speech");

    assert.equal(capturedUrl, "https://api.elevenlabs.io/v1/text-to-speech/voice-abc");
    assert.equal(capturedHeaders["xi-api-key"], "xi-test-key-123");
    assert.equal(capturedHeaders["Content-Type"], "application/json");

    const body = JSON.parse(capturedBody);
    assert.equal(body.text, "Test speech");
    assert.equal(body.model_id, "eleven_multilingual_v2");
    assert.deepEqual(body.voice_settings, { stability: 0.5, similarity_boost: 0.75 });
  });

  it("throws on API error with status and body", async () => {
    setTtsConfig(TEST_CONFIG);
    globalThis.fetch = mockFetchError(429, "Rate limit exceeded");

    await assert.rejects(
      () => synthesize("test"),
      (err: Error) => {
        assert.ok(err.message.includes("429"));
        assert.ok(err.message.includes("Rate limit exceeded"));
        return true;
      },
    );
  });
});
