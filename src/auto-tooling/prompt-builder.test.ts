import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAutoToolPrompt, buildEnrichmentPrompt } from "./prompt-builder.js";
import type { AutoToolContext } from "./prompt-builder.js";

function makeContext(overrides: Partial<AutoToolContext> = {}): AutoToolContext {
  return {
    taskDescription: "Build a website monitor",
    requirements: ["Check every 5 minutes", "Send alerts on failure"],
    constraints: ["No external dependencies", "Must run offline"],
    techStack: ["TypeScript", "Node.js"],
    userDoesntWant: ["No cloud APIs", "No telemetry"],
    ...overrides,
  };
}

describe("buildAutoToolPrompt", () => {
  it("includes task description", () => {
    const ctx = makeContext({ taskDescription: "Build a PDF generator" });
    const result = buildAutoToolPrompt(ctx, "/tmp/project", "");
    assert.ok(result.prompt.includes("Build a PDF generator"));
  });

  it("includes requirements", () => {
    const ctx = makeContext({ requirements: ["Must be fast", "Must be secure"] });
    const result = buildAutoToolPrompt(ctx, "/tmp/project", "");
    assert.ok(result.prompt.includes("## Requirements"));
    assert.ok(result.prompt.includes("- Must be fast"));
    assert.ok(result.prompt.includes("- Must be secure"));
  });

  it("includes constraints", () => {
    const ctx = makeContext({ constraints: ["Max 50MB disk"] });
    const result = buildAutoToolPrompt(ctx, "/tmp/project", "");
    assert.ok(result.prompt.includes("## Constraints"));
    assert.ok(result.prompt.includes("- Max 50MB disk"));
  });

  it("includes expected output section", () => {
    const result = buildAutoToolPrompt(makeContext(), "/tmp/project", "");
    assert.ok(result.prompt.includes("## Expected Output"));
    assert.ok(result.prompt.includes("package.json"));
    assert.ok(result.prompt.includes("error handling"));
    assert.ok(result.prompt.includes("SIGTERM"));
  });

  it("includes doesnt-want", () => {
    const ctx = makeContext({ userDoesntWant: ["No tracking", "No ads"] });
    const result = buildAutoToolPrompt(ctx, "/tmp/project", "");
    assert.ok(result.prompt.includes("## What NOT to do"));
    assert.ok(result.prompt.includes("- No tracking"));
    assert.ok(result.prompt.includes("- No ads"));
  });

  it("flags include --dangerously-skip-permissions", () => {
    const result = buildAutoToolPrompt(makeContext(), "/tmp/project", "");
    assert.ok(result.flags.includes("--dangerously-skip-permissions"));
  });

  it("flags include --max-turns", () => {
    const result = buildAutoToolPrompt(makeContext(), "/tmp/project", "");
    const maxTurnsIdx = result.flags.indexOf("--max-turns");
    assert.ok(maxTurnsIdx >= 0);
    assert.equal(result.flags[maxTurnsIdx + 1], "50");
  });

  it("systemPrompt mentions CLAUDE.md", () => {
    const result = buildAutoToolPrompt(makeContext(), "/tmp/project", "");
    assert.ok(result.systemPrompt.includes("CLAUDE.md"));
  });

  it("handles empty context", () => {
    const ctx = makeContext({
      taskDescription: "Minimal task",
      requirements: [],
      constraints: [],
      techStack: [],
      userDoesntWant: [],
    });
    const result = buildAutoToolPrompt(ctx, "/tmp/project", "");
    assert.ok(result.prompt.includes("Minimal task"));
    // Should not include optional sections with empty content
    assert.ok(!result.prompt.includes("## Requirements"));
    assert.ok(!result.prompt.includes("## What NOT to do"));
    // Tech Stack and Constraints headers should still be present (even if empty)
    assert.ok(result.prompt.includes("## Tech Stack"));
    assert.ok(result.prompt.includes("## Constraints"));
  });

  it("flags include --output-format stream-json", () => {
    const result = buildAutoToolPrompt(makeContext(), "/tmp/project", "");
    const fmtIdx = result.flags.indexOf("--output-format");
    assert.ok(fmtIdx >= 0);
    assert.equal(result.flags[fmtIdx + 1], "stream-json");
  });
});

describe("buildEnrichmentPrompt", () => {
  it("mentions CLAUDE.md", () => {
    const prompt = buildEnrichmentPrompt("/tmp/project");
    assert.ok(prompt.includes("CLAUDE.md"));
  });

  it("instructs to add architecture section", () => {
    const prompt = buildEnrichmentPrompt("/tmp/project");
    assert.ok(prompt.includes("Architecture"));
  });

  it("instructs to keep existing sections unchanged", () => {
    const prompt = buildEnrichmentPrompt("/tmp/project");
    assert.ok(prompt.includes("unchanged"));
  });

  it("instructs to only add new sections", () => {
    const prompt = buildEnrichmentPrompt("/tmp/project");
    assert.ok(prompt.includes("Only ADD"));
  });
});
