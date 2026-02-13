import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isConversionNeeded, convertToWav, checkFfmpegAvailable } from "./converter.js";

// ── isConversionNeeded ───────────────────────────────────────────────────────

describe("isConversionNeeded", () => {
  it("returns false for wav", () => {
    assert.equal(isConversionNeeded("wav"), false);
  });

  it("returns false for wave", () => {
    assert.equal(isConversionNeeded("wave"), false);
  });

  it("returns false for audio/wav with mime prefix", () => {
    assert.equal(isConversionNeeded("audio/wav"), false);
  });

  it("returns true for ogg", () => {
    assert.equal(isConversionNeeded("ogg"), true);
  });

  it("returns true for opus", () => {
    assert.equal(isConversionNeeded("opus"), true);
  });

  it("returns true for mp4", () => {
    assert.equal(isConversionNeeded("mp4"), true);
  });

  it("returns true for m4a", () => {
    assert.equal(isConversionNeeded("m4a"), true);
  });

  it("returns true for mp3", () => {
    assert.equal(isConversionNeeded("mp3"), true);
  });

  it("returns true for webm", () => {
    assert.equal(isConversionNeeded("webm"), true);
  });

  it("returns true for audio/ogg with mime prefix", () => {
    assert.equal(isConversionNeeded("audio/ogg"), true);
  });

  it("returns true for oga", () => {
    assert.equal(isConversionNeeded("oga"), true);
  });

  it("returns true for aac", () => {
    assert.equal(isConversionNeeded("aac"), true);
  });

  it("returns true for flac", () => {
    assert.equal(isConversionNeeded("flac"), true);
  });

  it("is case-insensitive", () => {
    assert.equal(isConversionNeeded("WAV"), false);
    assert.equal(isConversionNeeded("OGG"), true);
  });
});

// ── convertToWav ─────────────────────────────────────────────────────────────

describe("convertToWav", () => {
  it("returns original buffer for wav format", async () => {
    const buf = Buffer.from("fake wav data");
    const result = await convertToWav(buf, "wav");
    assert.strictEqual(result, buf);
  });

  it("returns original buffer for audio/wav mime type", async () => {
    const buf = Buffer.from("fake wav data");
    const result = await convertToWav(buf, "audio/wav");
    assert.strictEqual(result, buf);
  });
});

// ── checkFfmpegAvailable ─────────────────────────────────────────────────────

describe("checkFfmpegAvailable", () => {
  it("returns a boolean", async () => {
    const result = await checkFfmpegAvailable();
    assert.equal(typeof result, "boolean");
  });
});
