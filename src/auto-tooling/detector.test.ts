import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectCapabilityGap, formatProposal } from "./detector.js";

describe("auto-tooling/detector", () => {
  it("detectCapabilityGap finds gap for 'attachment' request", () => {
    const result = detectCapabilityGap("Download the attachment from that email");
    assert.equal(result.hasGap, true);
    assert.equal(result.missingCapability, "email_attachment_download");
    assert.ok(result.suggestion.length > 0);
  });

  it("detectCapabilityGap finds gap for 'backup' request", () => {
    const result = detectCapabilityGap("Create a backup of my project files");
    assert.equal(result.hasGap, true);
    assert.equal(result.missingCapability, "backup_automation");
    assert.ok(result.suggestion.includes("backup"));
  });

  it("detectCapabilityGap returns hasGap=false for normal request", () => {
    const result = detectCapabilityGap("What is the weather today?");
    assert.equal(result.hasGap, false);
    assert.equal(result.missingCapability, "");
    assert.equal(result.suggestion, "");
  });

  it("detectCapabilityGap handles failed tool", () => {
    const result = detectCapabilityGap(
      "Read that file",
      "read_file",
      "permission denied",
    );
    assert.equal(result.hasGap, true);
    assert.equal(result.missingCapability, "read_file_extended");
    assert.ok(result.suggestion.includes("permission denied"));
  });

  it("formatProposal returns formatted string", () => {
    const gap = detectCapabilityGap("Download the Anhang from the email");
    const proposal = formatProposal(gap);
    assert.ok(typeof proposal === "string");
    assert.ok(proposal.length > 0);
  });

  it("CAPABILITY_MAP has entries for common categories", () => {
    // Verify existingTools is populated from CAPABILITY_MAP
    const result = detectCapabilityGap("hello");
    assert.ok(result.existingTools.length > 0);
    assert.ok(result.existingTools.includes("read_file"));
    assert.ok(result.existingTools.includes("shell_exec"));
    assert.ok(result.existingTools.includes("claude_code"));
    assert.ok(result.existingTools.includes("web_search"));
    assert.ok(result.existingTools.includes("gmail_list"));
    assert.ok(result.existingTools.includes("browser"));
    assert.ok(result.existingTools.includes("smart_home"));
    assert.ok(result.existingTools.includes("tts_speak"));
  });

  it("detectCapabilityGap is case insensitive", () => {
    const lower = detectCapabilityGap("download the ATTACHMENT");
    assert.equal(lower.hasGap, true);
    assert.equal(lower.missingCapability, "email_attachment_download");

    const upper = detectCapabilityGap("CREATE A BACKUP");
    assert.equal(upper.hasGap, true);
    assert.equal(upper.missingCapability, "backup_automation");
  });

  it("detectCapabilityGap handles German keywords (Anhang, Sicherungskopie)", () => {
    const anhang = detectCapabilityGap("Lade den Anhang herunter");
    assert.equal(anhang.hasGap, true);
    assert.equal(anhang.missingCapability, "email_attachment_download");

    const sicherung = detectCapabilityGap("Erstelle eine Sicherungskopie");
    assert.equal(sicherung.hasGap, true);
    assert.equal(sicherung.missingCapability, "backup_automation");
  });
});
