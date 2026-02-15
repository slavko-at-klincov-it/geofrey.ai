import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger.js";
import type { LogLevel } from "./logger.js";

/** Capture stdout writes by temporarily replacing process.stdout.write */
function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return lines;
}

describe("createLogger", () => {
  let savedLogLevel: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedLogLevel = process.env.LOG_LEVEL;
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (savedLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = savedLogLevel;
    }
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it("outputs valid JSON line with correct fields for info level", () => {
    process.env.LOG_LEVEL = "info";
    delete process.env.NODE_ENV;
    const logger = createLogger("orchestrator");
    const lines = captureStdout(() => logger.info("Agent loop started"));

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "info");
    assert.equal(parsed.name, "orchestrator");
    assert.equal(parsed.msg, "Agent loop started");
    assert.ok(parsed.timestamp, "should have timestamp");
    // Validate ISO 8601 format
    assert.ok(!isNaN(Date.parse(parsed.timestamp)), "timestamp should be valid ISO date");
  });

  it("outputs correct JSON for each log level", () => {
    process.env.LOG_LEVEL = "debug";
    const logger = createLogger("test-module");
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];

    for (const level of levels) {
      const lines = captureStdout(() => logger[level](`Message at ${level}`));
      assert.equal(lines.length, 1, `Expected 1 line for ${level}`);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.level, level);
      assert.equal(parsed.msg, `Message at ${level}`);
      assert.equal(parsed.name, "test-module");
    }
  });

  it("merges context fields into output", () => {
    process.env.LOG_LEVEL = "info";
    const logger = createLogger("risk-classifier");
    const lines = captureStdout(() =>
      logger.info("Risk classified", { tool: "shell", riskLevel: 2, command: "rm -rf /tmp/test" }),
    );

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "info");
    assert.equal(parsed.name, "risk-classifier");
    assert.equal(parsed.msg, "Risk classified");
    assert.equal(parsed.tool, "shell");
    assert.equal(parsed.riskLevel, 2);
    assert.equal(parsed.command, "rm -rf /tmp/test");
  });

  it("suppresses debug messages at info level", () => {
    process.env.LOG_LEVEL = "info";
    delete process.env.NODE_ENV;
    const logger = createLogger("suppressed");
    const lines = captureStdout(() => logger.debug("This should not appear"));

    assert.equal(lines.length, 0);
  });

  it("outputs debug messages when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    const logger = createLogger("verbose");
    const lines = captureStdout(() => logger.debug("Visible debug message"));

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "debug");
    assert.equal(parsed.msg, "Visible debug message");
  });

  it("outputs debug messages when NODE_ENV=development", () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "development";
    const logger = createLogger("dev-logger");
    const lines = captureStdout(() => logger.debug("Dev debug message"));

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "debug");
  });

  it("includes the name field from createLogger argument", () => {
    process.env.LOG_LEVEL = "info";
    const logger = createLogger("approval-gate");
    const lines = captureStdout(() => logger.warn("Approval timeout"));

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.name, "approval-gate");
  });

  it("suppresses info and debug at warn level", () => {
    process.env.LOG_LEVEL = "warn";
    const logger = createLogger("strict");
    const lines = captureStdout(() => {
      logger.debug("hidden");
      logger.info("hidden");
      logger.warn("visible");
      logger.error("visible");
    });

    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).level, "warn");
    assert.equal(JSON.parse(lines[1]).level, "error");
  });

  it("defaults to info level when no env vars set", () => {
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
    const logger = createLogger("default");
    const lines = captureStdout(() => {
      logger.debug("hidden");
      logger.info("visible");
    });

    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).level, "info");
  });

  it("works without context argument", () => {
    process.env.LOG_LEVEL = "info";
    const logger = createLogger("minimal");
    const lines = captureStdout(() => logger.info("No context"));

    const parsed = JSON.parse(lines[0]);
    // Should only have level, name, msg, timestamp
    const keys = Object.keys(parsed);
    assert.deepEqual(keys, ["level", "name", "msg", "timestamp"]);
  });
});
