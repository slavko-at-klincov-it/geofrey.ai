import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAuditEntry, verifyChain, type AuditEntry } from "./audit-log.js";

const date = "2026-01-01";

function makeEntry(action: string): AuditEntry {
  return {
    timestamp: `${date}T00:00:00.000Z`,
    action,
    toolName: "test_tool",
    toolArgs: { key: "value" },
    riskLevel: "L1",
    approved: true,
    result: "ok",
    userId: "42",
  };
}

describe("audit-log", () => {
  it("writes entries and verifies chain, detects tampering", async () => {
    const dir = await mkdtemp(join(tmpdir(), "audit-"));

    await appendAuditEntry(dir, makeEntry("action_1"));
    await appendAuditEntry(dir, makeEntry("action_2"));
    await appendAuditEntry(dir, makeEntry("action_3"));

    // Chain should be valid
    const valid = await verifyChain(dir, date);
    assert.equal(valid.valid, true);
    assert.equal(valid.entries, 3);

    // Tamper with the second entry
    const logFile = join(dir, `${date}.jsonl`);
    const content = await readFile(logFile, "utf-8");
    const lines = content.trim().split("\n");
    const tampered = JSON.parse(lines[1]);
    tampered.action = "TAMPERED";
    lines[1] = JSON.stringify(tampered);
    await writeFile(logFile, lines.join("\n") + "\n");

    // Chain should detect tampering
    const invalid = await verifyChain(dir, date);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.firstBroken, 1);
  });
});
