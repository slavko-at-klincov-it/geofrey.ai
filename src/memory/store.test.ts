import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readMemory,
  writeMemory,
  appendMemory,
  readDailyNote,
  writeDailyNote,
  appendDailyNote,
  setMemoryDir,
} from "./store.js";

let tempDir: string;

describe("memory/store", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "memory-store-"));
    setMemoryDir(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("readMemory returns empty string for non-existent file", async () => {
    const content = await readMemory();
    assert.equal(content, "");
  });

  it("writeMemory + readMemory roundtrip", async () => {
    await writeMemory("Hello, memory!");
    const content = await readMemory();
    assert.equal(content, "Hello, memory!");
  });

  it("writeMemory overwrites existing content", async () => {
    await writeMemory("first");
    await writeMemory("second");
    const content = await readMemory();
    assert.equal(content, "second");
  });

  it("appendMemory appends with newline separator", async () => {
    await writeMemory("line 1");
    await appendMemory("line 2");
    const content = await readMemory();
    assert.equal(content, "line 1\nline 2");
  });

  it("appendMemory to empty file does not add leading newline", async () => {
    await appendMemory("first entry");
    const content = await readMemory();
    assert.equal(content, "first entry");
  });

  it("appendMemory multiple times", async () => {
    await appendMemory("a");
    await appendMemory("b");
    await appendMemory("c");
    const content = await readMemory();
    assert.equal(content, "a\nb\nc");
  });

  it("readDailyNote returns empty string for non-existent date", async () => {
    const content = await readDailyNote("2026-01-01");
    assert.equal(content, "");
  });

  it("writeDailyNote + readDailyNote roundtrip", async () => {
    await writeDailyNote("daily content", "2026-02-13");
    const content = await readDailyNote("2026-02-13");
    assert.equal(content, "daily content");
  });

  it("appendDailyNote appends correctly", async () => {
    await writeDailyNote("entry 1", "2026-02-13");
    await appendDailyNote("entry 2", "2026-02-13");
    const content = await readDailyNote("2026-02-13");
    assert.equal(content, "entry 1\nentry 2");
  });

  it("daily notes are independent per date", async () => {
    await writeDailyNote("day 1", "2026-02-13");
    await writeDailyNote("day 2", "2026-02-14");
    assert.equal(await readDailyNote("2026-02-13"), "day 1");
    assert.equal(await readDailyNote("2026-02-14"), "day 2");
  });
});
