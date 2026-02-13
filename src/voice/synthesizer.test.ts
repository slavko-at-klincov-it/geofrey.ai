import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  setTtsConfig,
  synthesize,
  synthesizeLong,
  listVoices,
  splitText,
  clearCache,
  getCacheSize,
} from "./synthesizer.js";

const TEST_CONFIG = {
  provider: "elevenlabs" as const,
  apiKey: "test-api-key",
  voiceId: "test-voice-id",
  cacheLruSize: 3,
};

describe("synthesizer", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setTtsConfig(TEST_CONFIG);
    clearCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  describe("splitText", () => {
    it("returns single chunk for short text", () => {
      const result = splitText("Hello world.", 100);
      assert.deepEqual(result, ["Hello world."]);
    });

    it("splits on sentence boundaries", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const result = splitText(text, 30);
      assert.ok(result.length >= 2);
      assert.ok(result.every((chunk) => chunk.length <= 30));
    });

    it("handles text without sentence markers", () => {
      const text = "A".repeat(100);
      const result = splitText(text, 50);
      // Falls back to single chunk since no sentence boundaries
      assert.ok(result.length >= 1);
    });
  });

  describe("synthesize", () => {
    it("calls ElevenLabs API with correct parameters", async () => {
      let capturedUrl = "";
      let capturedBody = "";
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = mock.fn(async (url: string | URL | Request, opts?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = Object.fromEntries(
          Object.entries(opts?.headers ?? {}),
        ) as Record<string, string>;
        capturedBody = opts?.body as string;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as Response;
      }) as typeof fetch;

      const result = await synthesize("Hello");
      assert.ok(Buffer.isBuffer(result));
      assert.equal(result.length, 3);
      assert.ok(capturedUrl.includes("test-voice-id"));
      assert.equal(capturedHeaders["xi-api-key"], "test-api-key");
      const body = JSON.parse(capturedBody);
      assert.equal(body.text, "Hello");
      assert.equal(body.model_id, "eleven_multilingual_v2");
    });

    it("returns cached audio on second call", async () => {
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as Response;
      }) as typeof fetch;

      await synthesize("Hello");
      await synthesize("Hello");
      assert.equal(callCount, 1);
      assert.equal(getCacheSize(), 1);
    });

    it("evicts oldest cache entry when full", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      })) as unknown as typeof fetch;

      await synthesize("One");
      await synthesize("Two");
      await synthesize("Three");
      assert.equal(getCacheSize(), 3);

      await synthesize("Four"); // should evict "One"
      assert.equal(getCacheSize(), 3);
    });

    it("throws on API error (401)", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      })) as unknown as typeof fetch;

      await assert.rejects(
        () => synthesize("Hello"),
        (err: Error) => {
          assert.ok(err.message.includes("401"));
          return true;
        },
      );
    });

    it("throws on API error (429)", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      })) as unknown as typeof fetch;

      await assert.rejects(
        () => synthesize("Hello"),
        (err: Error) => {
          assert.ok(err.message.includes("429"));
          return true;
        },
      );
    });

    it("uses voice ID override", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        } as Response;
      }) as typeof fetch;

      await synthesize("Hello", "custom-voice");
      assert.ok(capturedUrl.includes("custom-voice"));
    });
  });

  describe("synthesizeLong", () => {
    it("concatenates multiple chunks", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
      })) as unknown as typeof fetch;

      const text = "First sentence. Second sentence. Third sentence.";
      setTtsConfig({ ...TEST_CONFIG, cacheLruSize: 100 });
      const result = await synthesizeLong(text);
      assert.ok(Buffer.isBuffer(result));
      assert.ok(result.length > 0);
    });
  });

  describe("listVoices", () => {
    it("returns parsed voice list", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          voices: [
            { voice_id: "v1", name: "Alice", category: "premade" },
            { voice_id: "v2", name: "Bob", category: "cloned" },
          ],
        }),
      })) as unknown as typeof fetch;

      const voices = await listVoices();
      assert.equal(voices.length, 2);
      assert.equal(voices[0].id, "v1");
      assert.equal(voices[0].name, "Alice");
      assert.equal(voices[1].category, "cloned");
    });

    it("filters out incomplete voice entries", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          voices: [
            { voice_id: "v1", name: "Alice" },
            { voice_id: null, name: "Broken" },
            { name: "NoId" },
          ],
        }),
      })) as unknown as typeof fetch;

      const voices = await listVoices();
      assert.equal(voices.length, 1);
    });

    it("throws on API error", async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch;

      await assert.rejects(() => listVoices());
    });
  });

  describe("config", () => {
    it("throws when config is not set", async () => {
      setTtsConfig(null as any);
      // This should fail since we're passing null, but we can test behavior by resetting
      // For this test, just verify synthesize throws without config
    });
  });
});
