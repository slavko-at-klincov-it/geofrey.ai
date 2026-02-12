import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { configSchema } from "./schema.js";

describe("configSchema", () => {
  const minimal = {
    telegram: { botToken: "123:ABC", ownerId: 42 },
    ollama: {},
    database: {},
    audit: {},
    limits: {},
    claude: {},
  };

  it("accepts valid config with all fields", () => {
    const full = {
      telegram: { botToken: "123:ABC", ownerId: 42 },
      ollama: { baseUrl: "http://localhost:11434", model: "qwen3:8b", numCtx: 16384 },
      database: { url: "./data/app.db" },
      audit: { logDir: "./data/audit" },
      limits: { maxAgentSteps: 15, approvalTimeoutMs: 300000, maxConsecutiveErrors: 3 },
      claude: { model: "claude-sonnet-4-5-20250929" },
    };
    const result = configSchema.parse(full);
    assert.equal(result.telegram.botToken, "123:ABC");
    assert.equal(result.telegram.ownerId, 42);
  });

  it("fills defaults for optional fields", () => {
    const result = configSchema.parse(minimal);
    assert.equal(result.ollama.baseUrl, "http://localhost:11434");
    assert.equal(result.ollama.model, "qwen3:8b");
    assert.equal(result.limits.maxAgentSteps, 15);
  });

  it("rejects missing botToken", () => {
    assert.throws(() => {
      configSchema.parse({ ...minimal, telegram: { ownerId: 42 } });
    });
  });

  it("rejects missing ownerId", () => {
    assert.throws(() => {
      configSchema.parse({ ...minimal, telegram: { botToken: "123:ABC" } });
    });
  });

  it("coerces string ownerId to number", () => {
    const result = configSchema.parse({
      ...minimal,
      telegram: { botToken: "123:ABC", ownerId: "42" },
    });
    assert.equal(result.telegram.ownerId, 42);
  });

  it("rejects invalid URL for ollama baseUrl", () => {
    assert.throws(() => {
      configSchema.parse({ ...minimal, ollama: { baseUrl: "not-a-url" } });
    });
  });
});
