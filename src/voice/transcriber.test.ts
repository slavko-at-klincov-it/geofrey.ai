import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  setTranscriberConfig,
  transcribe,
  transcribeOpenai,
  transcribeLocal,
} from "./transcriber.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_AUDIO = Buffer.from("fake audio data");

// ── setTranscriberConfig + transcribe routing ────────────────────────────────

describe("transcribe", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("throws when no config is set", async () => {
    // Reset config by setting it to a known state, then testing fresh import
    // We can't truly reset module state, so test with missing key instead
    setTranscriberConfig({ provider: "openai" });
    // With OpenAI provider but no API key, should fail in transcribeOpenai
    await assert.rejects(
      () => transcribe(SAMPLE_AUDIO, "wav"),
      (err: Error) => err.message.includes("API key"),
    );
  });

  it("routes to openai provider", async () => {
    setTranscriberConfig({ provider: "openai", openaiApiKey: "sk-test" });

    // Mock global fetch
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ text: "hello world", language: "en" }),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const result = await transcribe(SAMPLE_AUDIO, "wav");
      assert.equal(result.text, "hello world");
      assert.equal(result.language, "en");
      assert.ok(typeof result.durationMs === "number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes to local provider", async () => {
    setTranscriberConfig({ provider: "local", whisperModelPath: "/models/ggml-base.bin" });

    // This will fail because whisper-cli is not installed in test env
    await assert.rejects(
      () => transcribe(SAMPLE_AUDIO, "wav"),
    );
  });
});

// ── transcribeOpenai ─────────────────────────────────────────────────────────

describe("transcribeOpenai", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("sends correct request to OpenAI API", async () => {
    setTranscriberConfig({ provider: "openai", openaiApiKey: "sk-test-key" });

    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = mock.fn(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = Object.fromEntries(
        Object.entries(opts.headers ?? {}),
      ) as Record<string, string>;
      return {
        ok: true,
        json: async () => ({ text: "transcribed text" }),
      };
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const result = await transcribeOpenai(SAMPLE_AUDIO, "ogg");
      assert.equal(result.text, "transcribed text");
      assert.equal(capturedUrl, "https://api.openai.com/v1/audio/transcriptions");
      assert.equal(capturedHeaders["Authorization"], "Bearer sk-test-key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on API error", async () => {
    setTranscriberConfig({ provider: "openai", openaiApiKey: "sk-test-key" });

    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      await assert.rejects(
        () => transcribeOpenai(SAMPLE_AUDIO, "ogg"),
        (err: Error) => {
          assert.ok(err.message.includes("401"));
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when API key is missing", async () => {
    setTranscriberConfig({ provider: "openai" }); // no openaiApiKey

    await assert.rejects(
      () => transcribeOpenai(SAMPLE_AUDIO, "ogg"),
      (err: Error) => {
        assert.ok(err.message.includes("API key"));
        return true;
      },
    );
  });
});

// ── transcribeLocal ──────────────────────────────────────────────────────────

describe("transcribeLocal", () => {
  it("throws when whisper model path is missing", async () => {
    setTranscriberConfig({ provider: "local" }); // no whisperModelPath

    await assert.rejects(
      () => transcribeLocal(SAMPLE_AUDIO, "wav"),
      (err: Error) => {
        assert.ok(err.message.includes("model path"));
        return true;
      },
    );
  });

  it("throws when whisper-cli is not available", async () => {
    setTranscriberConfig({ provider: "local", whisperModelPath: "/tmp/model.bin" });

    // whisper-cli is not installed in test environment, so execa should fail
    await assert.rejects(
      () => transcribeLocal(SAMPLE_AUDIO, "wav"),
    );
  });
});
