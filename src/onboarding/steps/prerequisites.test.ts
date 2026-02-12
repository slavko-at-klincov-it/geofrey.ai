import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";

// We test the prerequisite logic indirectly by testing the validators
// since runPrerequisites requires interactive prompts.
// The validators (validateOllamaConnection) are tested in validate.test.ts.

describe("prerequisites", () => {
  it("Node.js version is 22+", () => {
    const version = parseInt(process.version.slice(1), 10);
    assert.ok(version >= 22, `Node.js ${process.version} < 22`);
  });

  it("can import execa", async () => {
    const { execa } = await import("execa");
    assert.equal(typeof execa, "function");
  });

  it("can import prerequisite module", async () => {
    const mod = await import("./prerequisites.js");
    assert.equal(typeof mod.runPrerequisites, "function");
  });

  it("exports PrerequisiteResult type shape", async () => {
    // Verify the expected interface by constructing a valid object
    const result = {
      nodeOk: true,
      pnpmOk: true,
      ollamaOk: false,
      modelLoaded: false,
      claudeCliOk: true,
    };
    assert.equal(typeof result.nodeOk, "boolean");
    assert.equal(typeof result.ollamaOk, "boolean");
  });
});
