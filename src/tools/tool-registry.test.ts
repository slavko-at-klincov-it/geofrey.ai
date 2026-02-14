import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  registerTool,
  getTool,
  getAllTools,
  getToolSchemas,
  getAiSdkTools,
} from "./tool-registry.js";

// Side-effect imports to register tools
import "./filesystem.js";
import "./shell.js";
import "./git.js";

describe("tool-registry", () => {
  // Tools are already registered by side-effect imports from other modules.
  // We test the registry API directly.

  it("getTool returns registered tools", () => {
    const tool = getTool("read_file");
    assert.ok(tool, "read_file should be registered");
    assert.equal(tool!.name, "read_file");
    assert.equal(tool!.source, "native");
  });

  it("getTool returns undefined for unknown tool", () => {
    assert.equal(getTool("nonexistent_tool_xyz"), undefined);
  });

  it("getAllTools returns all registered tools as array", () => {
    const all = getAllTools();
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 9, `Expected >=9 tools, got ${all.length}`);

    const names = all.map((t) => t.name);
    for (const expected of ["read_file", "write_file", "shell_exec", "git_status"]) {
      assert.ok(names.includes(expected), `Missing tool: ${expected}`);
    }
  });

  it("getToolSchemas returns object with description + parameters", () => {
    const schemas = getToolSchemas();
    assert.equal(typeof schemas, "object");

    const readFile = schemas.read_file;
    assert.ok(readFile, "read_file schema should exist");
    assert.equal(typeof readFile.description, "string");
    assert.ok(readFile.parameters, "Should have Zod parameters");
  });

  it("getAiSdkTools returns AI SDK wrapped tools", () => {
    const aiTools = getAiSdkTools();
    assert.equal(typeof aiTools, "object");
    assert.ok("read_file" in aiTools, "read_file should be in AI SDK tools");
    assert.ok("shell_exec" in aiTools, "shell_exec should be in AI SDK tools");
  });

  it("getAiSdkTools filters by allowed tool names", () => {
    const filtered = getAiSdkTools(["read_file", "list_dir"]);
    const keys = Object.keys(filtered);
    assert.equal(keys.length, 2);
    assert.ok(keys.includes("read_file"));
    assert.ok(keys.includes("list_dir"));
  });

  it("getAiSdkTools with empty filter returns all tools", () => {
    const all = getAiSdkTools([]);
    const allTools = getAiSdkTools();
    assert.equal(Object.keys(all).length, Object.keys(allTools).length);
  });

  it("registerTool + getTool round-trip", () => {
    const testName = `_test_tool_${Date.now()}`;
    registerTool({
      name: testName,
      description: "Test tool for unit test",
      parameters: z.object({ input: z.string() }),
      source: "native",
      execute: async ({ input }) => `echo: ${input}`,
    });

    const retrieved = getTool(testName);
    assert.ok(retrieved);
    assert.equal(retrieved!.name, testName);
    assert.equal(retrieved!.description, "Test tool for unit test");
    assert.equal(retrieved!.source, "native");
  });

  it("tool execute works through registry", async () => {
    const testName = `_test_exec_${Date.now()}`;
    registerTool({
      name: testName,
      description: "Executable test tool",
      parameters: z.object({ value: z.number() }),
      source: "native",
      execute: async ({ value }) => `result: ${value * 2}`,
    });

    const tool = getTool(testName);
    assert.ok(tool);
    const result = await tool!.execute({ value: 21 });
    assert.equal(result, "result: 42");
  });

  it("all registered tools have required fields", () => {
    for (const tool of getAllTools()) {
      assert.equal(typeof tool.name, "string", `Tool missing name`);
      assert.ok(tool.name.length > 0, "Tool name should not be empty");
      assert.equal(typeof tool.description, "string", `${tool.name}: missing description`);
      assert.ok(tool.description.length > 0, `${tool.name}: empty description`);
      assert.ok(tool.parameters, `${tool.name}: missing parameters`);
      assert.equal(typeof tool.execute, "function", `${tool.name}: missing execute`);
      assert.ok(["native", "mcp"].includes(tool.source), `${tool.name}: invalid source "${tool.source}"`);
    }
  });
});
