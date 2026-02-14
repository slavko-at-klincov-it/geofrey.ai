import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectContext, inferOutputType, extractSection } from "./context-collector.js";
import { setMemoryDir, writeMemory } from "../memory/store.js";

let tempDir: string;

describe("auto-tooling/context-collector", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "context-collector-"));
    setMemoryDir(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("collectContext returns basic structure", async () => {
    const ctx = await collectContext("Build me a PDF generator");
    assert.equal(ctx.taskDescription, "Build me a PDF generator");
    assert.ok(Array.isArray(ctx.requirements));
    assert.ok(Array.isArray(ctx.constraints));
    assert.ok(Array.isArray(ctx.userPreferences));
    assert.ok(Array.isArray(ctx.userDoesntWant));
    assert.ok(Array.isArray(ctx.techStack));
    assert.ok(ctx.techStack.includes("TypeScript"));
    assert.ok(ctx.techStack.includes("Node.js"));
    assert.ok(typeof ctx.outputType === "string");
  });

  it("inferOutputType detects cron patterns", () => {
    assert.equal(inferOutputType("Do this regelmäßig"), "cron_job");
    assert.equal(inferOutputType("Run daily at 8am"), "cron_job");
    assert.equal(inferOutputType("Schedule every hour"), "cron_job");
    assert.equal(inferOutputType("Execute weekly"), "cron_job");
    assert.equal(inferOutputType("Run it täglich"), "cron_job");
  });

  it("inferOutputType detects background patterns", () => {
    assert.equal(inferOutputType("Start a server"), "background_process");
    assert.equal(inferOutputType("Run as daemon"), "background_process");
    assert.equal(inferOutputType("Keep running in the background"), "background_process");
    assert.equal(inferOutputType("Im Hintergrund laufen lassen"), "background_process");
    assert.equal(inferOutputType("Listen on port 3000"), "background_process");
  });

  it("inferOutputType detects one-shot patterns", () => {
    assert.equal(inferOutputType("Do this einmal"), "one_shot");
    assert.equal(inferOutputType("Run once"), "one_shot");
    assert.equal(inferOutputType("Do it jetzt"), "one_shot");
    assert.equal(inferOutputType("Execute now"), "one_shot");
    assert.equal(inferOutputType("Mach das sofort"), "one_shot");
  });

  it("inferOutputType returns unknown for ambiguous", () => {
    assert.equal(inferOutputType("Build a PDF tool"), "unknown");
    assert.equal(inferOutputType("Process this data"), "unknown");
  });

  it("extractSection extracts bullet points from markdown section", () => {
    const markdown = `# Memory
## Preferences
- Dark mode
- Vim keybindings
## Doesn't-Want
- Cloud dependencies
- Telemetry
## Facts
- Uses TypeScript
`;
    const prefs = extractSection(markdown, "preferences");
    assert.deepEqual(prefs, ["Dark mode", "Vim keybindings"]);

    const doesntWant = extractSection(markdown, "doesnt-want");
    assert.deepEqual(doesntWant, ["Cloud dependencies", "Telemetry"]);
  });

  it("extractSection handles empty memory", () => {
    const result = extractSection("", "preferences");
    assert.deepEqual(result, []);
  });

  it("collectContext includes constraints from doesnt-want", async () => {
    await writeMemory(`## Doesn't-Want
- Cloud APIs
- Telemetry
`);

    const ctx = await collectContext("Build a tool");
    assert.ok(ctx.userDoesntWant.includes("Cloud APIs"));
    assert.ok(ctx.userDoesntWant.includes("Telemetry"));
    assert.ok(ctx.constraints.some((c) => c.includes("Cloud APIs")));
    assert.ok(ctx.constraints.some((c) => c.includes("Telemetry")));
  });
});
