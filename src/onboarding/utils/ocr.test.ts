import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractTokenFromImage, cleanupScreenshot } from "./ocr.js";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("extractTokenFromImage", () => {
  it("returns null for non-existent file", async () => {
    const result = await extractTokenFromImage("/does/not/exist.png", "telegram");
    assert.equal(result, null);
  });

  // Note: full OCR tests require actual images and tesseract.js WASM
  // which is too heavy for unit tests. Covered by manual testing.
});

describe("cleanupScreenshot", () => {
  it("deletes existing file", () => {
    const path = join(tmpdir(), `test-cleanup-${Date.now()}.tmp`);
    writeFileSync(path, "test");
    assert.equal(existsSync(path), true);
    cleanupScreenshot(path);
    assert.equal(existsSync(path), false);
  });

  it("does not throw for non-existent file", () => {
    assert.doesNotThrow(() => cleanupScreenshot("/does/not/exist.tmp"));
  });
});
