import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseStructuredMemory, formatStructuredMemory, appendStructuredEntry } from "./structured.js";
import { setMemoryDir, readMemory, writeMemory } from "./store.js";

describe("parseStructuredMemory", () => {
  it("parses all categories", () => {
    const md = `## Preferences
- User prefers dark mode

## Decisions
- [2026-02-14] Removed OpenRouter

## Wants
- TTS should be local

## Doesn't-Want
- No cloud LLM routers

## Facts
- Main project: geofrey.ai`;

    const entries = parseStructuredMemory(md);
    assert.equal(entries.length, 5);
    assert.equal(entries[0].category, "preferences");
    assert.equal(entries[0].content, "User prefers dark mode");
    assert.equal(entries[1].category, "decisions");
    assert.equal(entries[1].content, "Removed OpenRouter");
    assert.equal(entries[1].date, "2026-02-14");
    assert.equal(entries[2].category, "wants");
    assert.equal(entries[3].category, "doesnt-want");
    assert.equal(entries[4].category, "facts");
  });

  it("returns empty array for no structured content", () => {
    const entries = parseStructuredMemory("# Random heading\nSome text");
    assert.deepEqual(entries, []);
  });

  it("handles empty string", () => {
    assert.deepEqual(parseStructuredMemory(""), []);
  });

  it("ignores non-bullet lines in sections", () => {
    const md = `## Preferences
Some random text
- Actual preference
Another line`;
    const entries = parseStructuredMemory(md);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].content, "Actual preference");
  });
});

describe("formatStructuredMemory", () => {
  it("formats entries in section order", () => {
    const entries = [
      { category: "facts" as const, content: "A fact" },
      { category: "preferences" as const, content: "A preference" },
    ];
    const md = formatStructuredMemory(entries);
    assert.ok(md.indexOf("## Preferences") < md.indexOf("## Facts"));
    assert.ok(md.includes("- A fact"));
    assert.ok(md.includes("- A preference"));
  });

  it("includes dates for entries with dates", () => {
    const entries = [
      { category: "decisions" as const, content: "Chose X", date: "2026-02-14" },
    ];
    const md = formatStructuredMemory(entries);
    assert.ok(md.includes("- [2026-02-14] Chose X"));
  });

  it("returns empty string for no entries", () => {
    assert.equal(formatStructuredMemory([]), "");
  });
});

describe("appendStructuredEntry", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "memory-structured-"));
    setMemoryDir(tmpDir);
    // Ensure clean state
    await writeMemory("");
  });

  it("creates new section when none exists", async () => {
    await appendStructuredEntry({ category: "preferences", content: "Dark mode" });
    const content = await readMemory();
    assert.ok(content.includes("## Preferences"));
    assert.ok(content.includes("- Dark mode"));
  });

  it("appends to existing section", async () => {
    await writeMemory("## Preferences\n- First pref\n");
    await appendStructuredEntry({ category: "preferences", content: "Second pref" });
    const content = await readMemory();
    assert.ok(content.includes("- First pref"));
    assert.ok(content.includes("- Second pref"));
  });

  it("adds date prefix for decisions", async () => {
    await appendStructuredEntry({ category: "decisions", content: "Chose TypeScript" });
    const content = await readMemory();
    assert.ok(/- \[\d{4}-\d{2}-\d{2}\] Chose TypeScript/.test(content));
  });

  it("preserves existing content when adding new section", async () => {
    await writeMemory("# Main Memory\nSome existing content\n");
    await appendStructuredEntry({ category: "facts", content: "A fact" });
    const content = await readMemory();
    assert.ok(content.includes("# Main Memory"));
    assert.ok(content.includes("Some existing content"));
    assert.ok(content.includes("## Facts"));
    assert.ok(content.includes("- A fact"));
  });

  it("handles multiple categories", async () => {
    await appendStructuredEntry({ category: "wants", content: "Local TTS" });
    await appendStructuredEntry({ category: "doesnt-want", content: "No cloud APIs" });
    const content = await readMemory();
    assert.ok(content.includes("## Wants"));
    assert.ok(content.includes("- Local TTS"));
    assert.ok(content.includes("## Doesn't-Want"));
    assert.ok(content.includes("- No cloud APIs"));
  });

  // Cleanup
  it.after?.(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true }).catch(() => {});
  });
});
