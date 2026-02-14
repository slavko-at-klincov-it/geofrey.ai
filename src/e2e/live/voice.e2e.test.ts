/**
 * E2E: Voice Pipeline — format detection, audio conversion, transcription
 *
 * Tests isConversionNeeded (pure logic, always runs), convertToWav error paths,
 * and transcription error handling. Skips STT provider tests when no API key
 * or provider is configured.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { isConversionNeeded, convertToWav, checkFfmpegAvailable } from "../../voice/converter.js";
import { setTranscriberConfig, transcribe } from "../../voice/transcriber.js";

describe("E2E: Voice Pipeline", { timeout: 30_000 }, () => {
  let ffmpegAvailable = false;

  before(async () => {
    ffmpegAvailable = await checkFfmpegAvailable();
  });

  // ── isConversionNeeded ────────────────────────────────────────────────────

  describe("isConversionNeeded — format detection", () => {
    it("returns true for ogg format (Telegram voice messages)", () => {
      assert.equal(isConversionNeeded("ogg"), true);
    });

    it("returns true for opus format (WhatsApp voice messages)", () => {
      assert.equal(isConversionNeeded("opus"), true);
    });

    it("returns true for webm format (browser recording)", () => {
      assert.equal(isConversionNeeded("webm"), true);
    });

    it("returns true for mp3 format", () => {
      assert.equal(isConversionNeeded("mp3"), true);
    });

    it("returns true for m4a format (iOS voice memo)", () => {
      assert.equal(isConversionNeeded("m4a"), true);
    });

    it("returns true for aac format", () => {
      assert.equal(isConversionNeeded("aac"), true);
    });

    it("returns true for flac format", () => {
      assert.equal(isConversionNeeded("flac"), true);
    });

    it("returns true for oga format (Signal voice messages)", () => {
      assert.equal(isConversionNeeded("oga"), true);
    });

    it("returns false for wav — no conversion needed", () => {
      assert.equal(isConversionNeeded("wav"), false);
    });

    it("returns false for wave — alias for wav", () => {
      assert.equal(isConversionNeeded("wave"), false);
    });

    it("handles MIME type prefixes (audio/ogg)", () => {
      assert.equal(isConversionNeeded("audio/ogg"), true);
      assert.equal(isConversionNeeded("audio/wav"), false);
      assert.equal(isConversionNeeded("audio/opus"), true);
      assert.equal(isConversionNeeded("audio/webm"), true);
    });

    it("is case-insensitive", () => {
      assert.equal(isConversionNeeded("WAV"), false);
      assert.equal(isConversionNeeded("OGG"), true);
      assert.equal(isConversionNeeded("Opus"), true);
      assert.equal(isConversionNeeded("WAVE"), false);
    });
  });

  // ── convertToWav ──────────────────────────────────────────────────────────

  describe("convertToWav — conversion pipeline", () => {
    it("returns the original buffer unchanged for wav format", async () => {
      const wavBuffer = Buffer.from("RIFF....WAVEfmt fake wav header data");
      const result = await convertToWav(wavBuffer, "wav");
      assert.strictEqual(result, wavBuffer, "Should return the exact same buffer object");
    });

    it("returns the original buffer unchanged for audio/wav MIME type", async () => {
      const wavBuffer = Buffer.from("RIFF....WAVEfmt fake wav header data");
      const result = await convertToWav(wavBuffer, "audio/wav");
      assert.strictEqual(result, wavBuffer, "Should return the exact same buffer for audio/wav");
    });

    it("rejects or fails gracefully with empty buffer for ogg format", async (t) => {
      if (!ffmpegAvailable) {
        t.skip("ffmpeg not installed — cannot test conversion errors");
        return;
      }

      // An empty buffer is not valid audio — ffmpeg should fail
      const emptyBuffer = Buffer.alloc(0);
      await assert.rejects(
        convertToWav(emptyBuffer, "ogg"),
        "convertToWav should reject an empty buffer when conversion is needed",
      );
    });

    it("rejects with garbage data for opus format", async (t) => {
      if (!ffmpegAvailable) {
        t.skip("ffmpeg not installed — cannot test conversion errors");
        return;
      }

      // Random garbage is not valid audio
      const garbageBuffer = Buffer.from("Dies ist kein Audio. Nur zufaellige Bytes fuer den Test.");
      await assert.rejects(
        convertToWav(garbageBuffer, "opus"),
        "convertToWav should reject invalid audio data",
      );
    });
  });

  // ── checkFfmpegAvailable ──────────────────────────────────────────────────

  describe("checkFfmpegAvailable", () => {
    it("returns a boolean indicating ffmpeg presence", async () => {
      const result = await checkFfmpegAvailable();
      assert.equal(typeof result, "boolean");
      // On a dev machine ffmpeg is usually installed; on CI it might not be.
      // Either result is valid — we just verify the return type.
    });
  });

  // ── setTranscriberConfig ──────────────────────────────────────────────────

  describe("setTranscriberConfig — configuration", () => {
    it("does not throw with valid openai config", () => {
      assert.doesNotThrow(() => {
        setTranscriberConfig({ provider: "openai", openaiApiKey: "sk-test-dummy-key" });
      });
    });

    it("does not throw with valid local config", () => {
      assert.doesNotThrow(() => {
        setTranscriberConfig({ provider: "local", whisperModelPath: "/tmp/ggml-base.bin" });
      });
    });

    it("does not throw with minimal config (provider only)", () => {
      assert.doesNotThrow(() => {
        setTranscriberConfig({ provider: "openai" });
      });
    });
  });

  // ── transcribe — error paths ──────────────────────────────────────────────

  describe("transcribe — error handling", () => {
    it("throws when openai provider has no API key", async () => {
      setTranscriberConfig({ provider: "openai" }); // no openaiApiKey

      const fakeAudio = Buffer.from("fake audio payload for transcription test");
      await assert.rejects(
        transcribe(fakeAudio, "wav"),
        (err: Error) => {
          assert.ok(
            err.message.includes("API key"),
            `Expected 'API key' in error, got: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("throws when local provider has no whisper model path", async () => {
      setTranscriberConfig({ provider: "local" }); // no whisperModelPath

      const fakeAudio = Buffer.from("fake audio payload for local transcription test");
      await assert.rejects(
        transcribe(fakeAudio, "wav"),
        (err: Error) => {
          assert.ok(
            err.message.includes("model path") || err.message.includes("Whisper"),
            `Expected whisper-related error, got: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("transcribe with real OpenAI key and garbage audio returns API error", async (t) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        t.skip("OPENAI_API_KEY not set — skipping real API test");
        return;
      }

      setTranscriberConfig({ provider: "openai", openaiApiKey: apiKey });

      // Send garbage data — the API should reject it (not valid audio)
      const garbageAudio = Buffer.from("Das ist definitiv kein echtes Audioformat sondern nur Text.");
      await assert.rejects(
        transcribe(garbageAudio, "wav"),
        (err: Error) => {
          // OpenAI returns 400 for invalid audio
          assert.ok(
            err.message.includes("400") || err.message.includes("Invalid") || err.message.includes("could not"),
            `Expected API rejection for invalid audio, got: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("transcribe with local provider fails when whisper-cli is not installed", async () => {
      setTranscriberConfig({ provider: "local", whisperModelPath: "/tmp/nonexistent-model.bin" });

      const fakeAudio = Buffer.from("Testdaten fuer lokale Transkription");
      await assert.rejects(
        transcribe(fakeAudio, "wav"),
        "Should reject when whisper-cli binary is not found",
      );
    });
  });
});
