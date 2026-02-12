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
    mcp: {},
  };

  it("accepts valid config with all fields", () => {
    const full = {
      telegram: { botToken: "123:ABC", ownerId: 42 },
      ollama: { baseUrl: "http://localhost:11434", model: "qwen3:8b", numCtx: 16384 },
      database: { url: "./data/app.db" },
      audit: { logDir: "./data/audit" },
      limits: { maxAgentSteps: 15, approvalTimeoutMs: 300000, maxConsecutiveErrors: 3 },
      claude: {
        enabled: true,
        skipPermissions: true,
        outputFormat: "stream-json",
        maxBudgetUsd: 5,
        model: "claude-sonnet-4-5-20250929",
        sessionTtlMs: 3600000,
        timeoutMs: 600000,
        defaultDirs: ["/home/user/project"],
        mcpConfigPath: "/tmp/mcp.json",
        toolProfiles: {
          readOnly: "Read Glob Grep",
          standard: "Read Glob Grep Edit Write Bash(git:*)",
          full: "Read Glob Grep Edit Write Bash",
        },
      },
      mcp: { allowedServers: [] },
    };
    const result = configSchema.parse(full);
    assert.equal(result.telegram.botToken, "123:ABC");
    assert.equal(result.telegram.ownerId, 42);
    assert.equal(result.claude.maxBudgetUsd, 5);
    assert.deepEqual(result.claude.defaultDirs, ["/home/user/project"]);
  });

  it("fills defaults for optional fields", () => {
    const result = configSchema.parse(minimal);
    assert.equal(result.ollama.baseUrl, "http://localhost:11434");
    assert.equal(result.ollama.model, "qwen3:8b");
    assert.equal(result.limits.maxAgentSteps, 15);
  });

  it("defaults platform to telegram", () => {
    const result = configSchema.parse(minimal);
    assert.equal(result.platform, "telegram");
  });

  it("fills claude defaults", () => {
    const result = configSchema.parse(minimal);
    assert.equal(result.claude.enabled, true);
    assert.equal(result.claude.skipPermissions, true);
    assert.equal(result.claude.outputFormat, "stream-json");
    assert.equal(result.claude.model, "claude-sonnet-4-5-20250929");
    assert.equal(result.claude.sessionTtlMs, 3_600_000);
    assert.equal(result.claude.timeoutMs, 600_000);
    assert.deepEqual(result.claude.defaultDirs, []);
    assert.equal(result.claude.maxBudgetUsd, undefined);
    assert.equal(result.claude.mcpConfigPath, undefined);
  });

  it("fills claude toolProfiles defaults", () => {
    const result = configSchema.parse(minimal);
    assert.equal(result.claude.toolProfiles.readOnly, "Read Glob Grep");
    assert.equal(result.claude.toolProfiles.standard, "Read Glob Grep Edit Write Bash(git:*)");
    assert.equal(result.claude.toolProfiles.full, "Read Glob Grep Edit Write Bash");
  });

  it("rejects invalid outputFormat", () => {
    assert.throws(() => {
      configSchema.parse({ ...minimal, claude: { outputFormat: "xml" } });
    });
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

  it("defaults mcp.allowedServers to empty array", () => {
    const result = configSchema.parse(minimal);
    assert.deepEqual(result.mcp.allowedServers, []);
  });

  it("accepts mcp.allowedServers list", () => {
    const result = configSchema.parse({ ...minimal, mcp: { allowedServers: ["fs-server", "git-server"] } });
    assert.deepEqual(result.mcp.allowedServers, ["fs-server", "git-server"]);
  });

  it("accepts whatsapp platform with config", () => {
    const result = configSchema.parse({
      ...minimal,
      platform: "whatsapp",
      whatsapp: {
        phoneNumberId: "123456",
        accessToken: "token",
        verifyToken: "verify",
        ownerPhone: "491234567890",
      },
    });
    assert.equal(result.platform, "whatsapp");
    assert.equal(result.whatsapp!.phoneNumberId, "123456");
    assert.equal(result.whatsapp!.webhookPort, 3000);
  });

  it("rejects whatsapp platform without config", () => {
    assert.throws(() => {
      configSchema.parse({ ...minimal, platform: "whatsapp" });
    });
  });

  it("accepts signal platform with config", () => {
    const result = configSchema.parse({
      ...minimal,
      platform: "signal",
      signal: {
        ownerPhone: "+491234567890",
        botPhone: "+491234567891",
      },
    });
    assert.equal(result.platform, "signal");
    assert.equal(result.signal!.signalCliSocket, "/var/run/signal-cli/socket");
  });

  it("rejects signal platform without config", () => {
    assert.throws(() => {
      configSchema.parse({ ...minimal, platform: "signal" });
    });
  });
});
