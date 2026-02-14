import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateClaudeMd, extractBullets } from "./claude-md-generator.js";
import type { ClaudeMdOptions } from "./claude-md-generator.js";

function makeOpts(overrides: Partial<ClaudeMdOptions> = {}): ClaudeMdOptions {
  return {
    projectName: "test-project",
    taskDescription: "A test project for unit testing",
    requirements: ["Must be fast", "Must be reliable"],
    constraints: ["No network access"],
    userPreferences: ["Dark mode", "Verbose logging"],
    userDoesntWant: ["No telemetry", "No cloud dependencies"],
    techStack: ["TypeScript", "Node.js"],
    ...overrides,
  };
}

describe("generateClaudeMd", () => {
  it("produces valid markdown", () => {
    const md = generateClaudeMd(makeOpts());
    assert.ok(md.includes("# "));
    assert.ok(md.includes("## "));
    assert.ok(md.includes("- "));
    // Should end with newline
    assert.ok(md.endsWith("\n"));
  });

  it("includes project name as heading", () => {
    const md = generateClaudeMd(makeOpts({ projectName: "my-awesome-tool" }));
    assert.ok(md.includes("# my-awesome-tool"));
  });

  it("includes task description", () => {
    const md = generateClaudeMd(makeOpts({ taskDescription: "Build a PDF generator" }));
    assert.ok(md.includes("Build a PDF generator"));
  });

  it("includes requirements as bullets", () => {
    const md = generateClaudeMd(makeOpts({ requirements: ["Fast startup", "Low memory"] }));
    assert.ok(md.includes("## Requirements"));
    assert.ok(md.includes("- Fast startup"));
    assert.ok(md.includes("- Low memory"));
  });

  it("includes doesnt-want section", () => {
    const md = generateClaudeMd(makeOpts({ userDoesntWant: ["No analytics", "No tracking"] }));
    assert.ok(md.includes("## What We Don't Want"));
    assert.ok(md.includes("- No analytics"));
    assert.ok(md.includes("- No tracking"));
  });

  it("includes constraints", () => {
    const md = generateClaudeMd(makeOpts({ constraints: ["Max 10MB RAM"] }));
    assert.ok(md.includes("## Constraints"));
    assert.ok(md.includes("- Max 10MB RAM"));
    // Also includes default constraints
    assert.ok(md.includes("- Must run autonomously without user interaction"));
    assert.ok(md.includes("- Must handle errors gracefully with proper logging"));
    assert.ok(md.includes("- Must exit cleanly on SIGTERM/SIGINT"));
  });

  it("includes tech stack", () => {
    const md = generateClaudeMd(makeOpts({ techStack: ["Rust", "Tokio"] }));
    assert.ok(md.includes("## Tech Stack"));
    assert.ok(md.includes("- Rust"));
    assert.ok(md.includes("- Tokio"));
  });

  it("handles empty arrays gracefully", () => {
    const md = generateClaudeMd(makeOpts({
      requirements: [],
      constraints: [],
      userPreferences: [],
      userDoesntWant: [],
      techStack: [],
    }));
    // Should still have header and default sections
    assert.ok(md.includes("# test-project"));
    assert.ok(md.includes("## Overview"));
    assert.ok(md.includes("## Constraints"));
    assert.ok(md.includes("## Conventions"));
    // Should NOT have optional empty sections
    assert.ok(!md.includes("## Requirements"));
    assert.ok(!md.includes("## Tech Stack"));
    assert.ok(!md.includes("## What We Don't Want"));
    assert.ok(!md.includes("## User Preferences"));
  });

  it("does not duplicate constraints that match defaults", () => {
    const md = generateClaudeMd(makeOpts({
      constraints: ["Must run autonomously without user interaction"],
    }));
    const matches = md.match(/Must run autonomously without user interaction/g);
    assert.equal(matches?.length, 1);
  });
});

describe("extractBullets", () => {
  it("parses markdown sections correctly", () => {
    const md = `## Preferences
- Dark mode
- Large font

## Other Section
- Not this one`;

    const bullets = extractBullets(md, "preferences");
    assert.deepEqual(bullets, ["Dark mode", "Large font"]);
  });

  it("handles empty text", () => {
    const bullets = extractBullets("", "preferences");
    assert.deepEqual(bullets, []);
  });

  it("handles text with no matching section", () => {
    const md = `## Other
- Something`;
    const bullets = extractBullets(md, "preferences");
    assert.deepEqual(bullets, []);
  });

  it("matches case-insensitively", () => {
    const md = `## PREFERENCES
- Dark mode`;
    const bullets = extractBullets(md, "preferences");
    assert.deepEqual(bullets, ["Dark mode"]);
  });

  it("handles ### level headings", () => {
    const md = `### Doesnt-Want
- No cloud
- No tracking

### Other
- Irrelevant`;
    const bullets = extractBullets(md, "doesnt-want");
    assert.deepEqual(bullets, ["No cloud", "No tracking"]);
  });

  it("stops at next heading", () => {
    const md = `## Preferences
- First
## Facts
- Second`;
    const bullets = extractBullets(md, "preferences");
    assert.deepEqual(bullets, ["First"]);
  });
});
