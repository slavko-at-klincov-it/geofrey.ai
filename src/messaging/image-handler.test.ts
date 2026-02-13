import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { processImage } from "./image-handler.js";
import type { Config } from "../config/schema.js";

function makeConfig(overrides?: Partial<Config["imageSanitizer"]> & { auditLogDir?: string }): Config {
  const auditLogDir = overrides?.auditLogDir ?? join(tmpdir(), "test-audit");
  return {
    imageSanitizer: {
      enabled: true,
      maxInputSizeBytes: 20_971_520,
      scanForInjection: true,
      ...overrides,
    },
    audit: { logDir: auditLogDir },
  } as Config;
}

async function createTestJpeg(width = 100, height = 100): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).jpeg().toBuffer();
}

describe("processImage", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "img-handler-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("processes a valid JPEG and returns description", async () => {
    const buffer = await createTestJpeg(320, 240);
    const config = makeConfig({ auditLogDir: join(tmpDir, "audit") });

    const result = await processImage(
      { buffer, mimeType: "image/jpeg" },
      "test-chat",
      config,
    );

    assert.ok(result.description.includes("[Image: jpeg, 320x240"));
    assert.ok(result.description.includes("Stored: data/images/"));
    assert.ok(result.storagePath.startsWith("data/images/"));
    assert.ok(result.storagePath.endsWith(".jpeg"));
    assert.equal(result.report.format, "jpeg");
    assert.equal(result.report.metadataStripped, true);
  });

  it("includes caption in description when provided", async () => {
    const buffer = await createTestJpeg();
    const config = makeConfig({ auditLogDir: join(tmpDir, "audit") });

    const result = await processImage(
      { buffer, mimeType: "image/jpeg", caption: "My photo" },
      "test-chat",
      config,
    );

    assert.ok(result.description.includes("Caption: My photo"));
  });

  it("stores sanitized file to data/images", async () => {
    const buffer = await createTestJpeg();
    const config = makeConfig({ auditLogDir: join(tmpDir, "audit") });

    const result = await processImage(
      { buffer, mimeType: "image/jpeg" },
      "test-chat",
      config,
    );

    // Check the file was stored (path exists in result)
    assert.ok(result.storagePath.match(/data\/images\/[a-f0-9-]+\.jpeg/));
  });

  it("creates audit entry", async () => {
    const auditDir = join(tmpDir, "audit");
    const buffer = await createTestJpeg();
    const config = makeConfig({ auditLogDir: auditDir });

    await processImage(
      { buffer, mimeType: "image/jpeg" },
      "test-chat",
      config,
    );

    const files = await readdir(auditDir);
    assert.ok(files.length > 0, "audit log file should be created");
    assert.ok(files[0].endsWith(".jsonl"));
  });

  it("handles PNG images", async () => {
    const buffer = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    }).png().toBuffer();
    const config = makeConfig({ auditLogDir: join(tmpDir, "audit") });

    const result = await processImage(
      { buffer, mimeType: "image/png" },
      "test-chat",
      config,
    );

    assert.ok(result.description.includes("[Image: png,"));
    assert.ok(result.storagePath.endsWith(".png"));
  });
});
