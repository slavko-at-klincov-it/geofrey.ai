import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectCapabilityGap } from "../../auto-tooling/detector.js";
import { DUMMY_GAP_REQUESTS } from "./helpers/fixtures.js";

describe("E2E: Auto-Tooling Gap Detection", () => {
  it("detects known capability gaps", () => {
    const result = detectCapabilityGap("Download email attachments and save them to disk");
    assert.equal(result.hasGap, true);
    assert.equal(result.missingCapability, "email_attachment_download");
    assert.ok(result.suggestion.length > 0);
  });

  it("returns no gap for existing capabilities", () => {
    const result = detectCapabilityGap("Read the file at /tmp/test.txt");
    assert.equal(result.hasGap, false);
    assert.equal(result.missingCapability, "");
  });

  it("detects gaps from German input", () => {
    // Pattern: /pdf.*erstell/ — "pdf" must come before "erstell" in text
    const result = detectCapabilityGap("Bitte ein PDF erstellen aus diesen Daten");
    assert.equal(result.hasGap, true);
    assert.equal(result.missingCapability, "pdf_generation");
  });

  it("matches all 10 gap patterns", () => {
    for (const { input, expected } of DUMMY_GAP_REQUESTS) {
      const result = detectCapabilityGap(input);
      assert.equal(result.hasGap, true, `Expected gap for: "${input}"`);
      assert.equal(result.missingCapability, expected, `Wrong capability for: "${input}"`);
    }
  });
});
