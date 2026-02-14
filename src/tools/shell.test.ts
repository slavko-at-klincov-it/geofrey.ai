import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTool } from "./tool-registry.js";

// Import to ensure registration side-effect
import "./shell.js";

describe("shell tool", () => {
  it("is registered as shell_exec", () => {
    const tool = getTool("shell_exec");
    assert.ok(tool);
    assert.equal(tool!.name, "shell_exec");
    assert.equal(tool!.source, "native");
  });

  it("executes simple echo command", async () => {
    const tool = getTool("shell_exec")!;
    const result = await tool.execute({ command: "echo hello_from_test" });
    assert.ok(result.includes("hello_from_test"), `Expected echo output, got: ${result}`);
  });

  it("returns exit code on failure", async () => {
    const tool = getTool("shell_exec")!;
    const result = await tool.execute({ command: "exit 42" });
    assert.ok(result.includes("EXIT 42"), `Expected EXIT 42, got: ${result}`);
  });

  it("returns '(no output)' for empty command output", async () => {
    const tool = getTool("shell_exec")!;
    const result = await tool.execute({ command: "true" });
    assert.equal(result, "(no output)");
  });

  it("captures stderr on failure", async () => {
    const tool = getTool("shell_exec")!;
    const result = await tool.execute({ command: "ls /nonexistent_dir_xyz_12345 2>&1" });
    assert.ok(result.length > 0, "Should have error output");
  });

  it("rejects cwd outside project root", async () => {
    const tool = getTool("shell_exec")!;
    await assert.rejects(
      () => tool.execute({ command: "pwd", cwd: "/tmp" }),
      (err: Error) => err.message.includes("/tmp"),
    );
  });

  it("accepts cwd within project root", async () => {
    const tool = getTool("shell_exec")!;
    const result = await tool.execute({ command: "pwd", cwd: "." });
    assert.ok(result.includes(process.cwd()), `Expected cwd in output, got: ${result}`);
  });

  it("pipes and redirection work", async () => {
    const tool = getTool("shell_exec")!;
    const result = await tool.execute({ command: "echo abc | wc -c" });
    assert.ok(result.trim().length > 0, "Should have character count");
  });
});
