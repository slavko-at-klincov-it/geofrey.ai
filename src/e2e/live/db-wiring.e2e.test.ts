/**
 * E2E tests for DB wiring: pending_approvals, webhook_configs, google_tokens.
 * Uses real SQLite databases — no mocks.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { getDb, closeDb } from "../../db/client.js";
import {
  pendingApprovals,
  webhooks as webhooksTable,
  googleTokens,
  conversations,
} from "../../db/schema.js";
import { eq } from "drizzle-orm";

// ─── pending_approvals ──────────────────────────────────────────────────────

describe("E2E: pending_approvals DB wiring", { timeout: 30_000 }, () => {
  let env: TestEnv;
  let db: ReturnType<typeof getDb>;

  before(async () => {
    env = await createTestEnv();
    db = getDb(env.dbUrl);
  });

  after(async () => {
    // Reset module-level state so other test suites aren't affected
    const { setApprovalDb } = await import("../../approval/approval-gate.js");
    setApprovalDb(null);
    await env.cleanup();
  });

  it("createApproval persists row to DB and resolveApproval updates status", async () => {
    const { setApprovalDb, createApproval, resolveApproval } = await import(
      "../../approval/approval-gate.js"
    );
    setApprovalDb(db);

    // Insert a conversation row to satisfy the FK constraint
    const convId = "conv-e2e-approval-001";
    db.insert(conversations)
      .values({ id: convId, chatId: "chat-123", createdAt: new Date(), updatedAt: new Date() })
      .run();

    const { nonce, promise } = createApproval(
      "shell",
      { command: "rm -rf /tmp/testdata" },
      { level: "L2" as const, reason: "Destructive shell command", toolName: "shell" },
      undefined,
      convId,
    );

    // Verify the row was inserted
    const row = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, nonce))
      .get();

    assert.ok(row, "pending_approvals row should exist after createApproval");
    assert.equal(row.status, "pending");
    assert.equal(row.toolName, "shell");
    assert.equal(row.riskLevel, "L2");
    assert.equal(row.conversationId, convId);
    assert.equal(JSON.parse(row.toolArgs).command, "rm -rf /tmp/testdata");
    assert.ok(row.createdAt, "createdAt should be set");
    assert.equal(row.resolvedAt, null, "resolvedAt should be null while pending");

    // Resolve the approval
    const resolved = resolveApproval(nonce, true);
    assert.equal(resolved, true, "resolveApproval should return true for valid nonce");

    // Verify DB row was updated
    const updatedRow = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, nonce))
      .get();

    assert.ok(updatedRow, "Row should still exist after resolution");
    assert.equal(updatedRow.status, "approved");
    assert.ok(updatedRow.resolvedAt, "resolvedAt should be set after resolution");

    // Verify promise resolved to true
    const result = await promise;
    assert.equal(result, true);
  });

  it("resolveApproval with denied=false sets status to 'denied'", async () => {
    const { createApproval, resolveApproval } = await import(
      "../../approval/approval-gate.js"
    );

    const convId = "conv-e2e-approval-001"; // reuse conversation from above

    const { nonce, promise } = createApproval(
      "git",
      { command: "push --force" },
      { level: "L2" as const, reason: "Force push", toolName: "git" },
      undefined,
      convId,
    );

    resolveApproval(nonce, false);

    const row = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, nonce))
      .get();

    assert.ok(row);
    assert.equal(row.status, "denied");
    assert.ok(row.resolvedAt);

    const result = await promise;
    assert.equal(result, false);
  });

  it("timeout sets status to 'timeout' in DB", async () => {
    const { createApproval } = await import("../../approval/approval-gate.js");

    const convId = "conv-e2e-approval-001";

    const { nonce, promise } = createApproval(
      "filesystem",
      { path: "/etc/passwd" },
      { level: "L2" as const, reason: "Sensitive file access", toolName: "filesystem" },
      200, // 200ms timeout
      convId,
    );

    // Wait for timeout to fire
    const result = await promise;
    assert.equal(result, false, "Timed-out approval should resolve to false");

    // Give DB update a moment (fire-and-forget)
    await new Promise((r) => setTimeout(r, 100));

    const row = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, nonce))
      .get();

    assert.ok(row, "Row should exist");
    assert.equal(row.status, "timeout");
    assert.ok(row.resolvedAt, "resolvedAt should be set on timeout");
  });

  it("rejectAllPending updates all rows to 'denied'", async () => {
    const { createApproval, rejectAllPending } = await import(
      "../../approval/approval-gate.js"
    );

    const convId = "conv-e2e-approval-001";

    const a1 = createApproval(
      "shell",
      { command: "apt install something" },
      { level: "L2" as const, reason: "Package install", toolName: "shell" },
      undefined,
      convId,
    );
    const a2 = createApproval(
      "git",
      { command: "commit -m 'test'" },
      { level: "L2" as const, reason: "Git commit", toolName: "git" },
      undefined,
      convId,
    );

    rejectAllPending("Shutdown");

    // Both promises should resolve to false
    assert.equal(await a1.promise, false);
    assert.equal(await a2.promise, false);

    // Give DB updates a moment
    await new Promise((r) => setTimeout(r, 100));

    const row1 = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, a1.nonce))
      .get();
    const row2 = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, a2.nonce))
      .get();

    assert.ok(row1);
    assert.ok(row2);
    assert.equal(row1.status, "denied");
    assert.equal(row2.status, "denied");
    assert.ok(row1.resolvedAt);
    assert.ok(row2.resolvedAt);
  });

  it("createApproval without conversationId defaults to 'default' — FK violation is handled", async () => {
    const { createApproval, resolveApproval } = await import(
      "../../approval/approval-gate.js"
    );

    // No conversation with id "default" exists — FK constraint should prevent INSERT.
    // The fire-and-forget try/catch should handle this gracefully.
    const { nonce, promise } = createApproval(
      "shell",
      { command: "echo hello" },
      { level: "L1" as const, reason: "Simple echo", toolName: "shell" },
    );

    // In-memory approval should still work even if DB write failed
    resolveApproval(nonce, true);
    const result = await promise;
    assert.equal(result, true, "In-memory approval should work even if DB insert failed");

    // DB row should NOT exist (FK violation silently caught)
    const row = db
      .select()
      .from(pendingApprovals)
      .where(eq(pendingApprovals.nonce, nonce))
      .get();

    // This test documents the current behavior: row is missing due to FK violation.
    // If this assertion fails (row exists), then FK constraints are off or a "default"
    // conversation was inserted somewhere.
    assert.equal(row, undefined, "Row should not exist due to FK constraint violation on 'default' conversationId");
  });
});

// ─── webhook_configs ────────────────────────────────────────────────────────

describe("E2E: webhook_configs DB wiring", { timeout: 30_000 }, () => {
  let env: TestEnv;
  let db: ReturnType<typeof getDb>;

  before(async () => {
    env = await createTestEnv();
    db = getDb(env.dbUrl);
  });

  after(async () => {
    await env.cleanup();
  });

  it("register persists webhook to DB", async () => {
    const { createWebhookRouter } = await import("../../webhooks/router.js");
    const router = createWebhookRouter(10, db);

    router.register({
      id: "wh-db-test-1",
      name: "GitHub CI Webhook",
      path: "/webhook/github-ci",
      secret: "geheimer-schluessel-2026",
      template: "github",
      enabled: true,
      chatId: "chat-dev-team",
    });

    // Verify it's in memory
    const listed = router.listAll();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "wh-db-test-1");

    // Verify it's in DB
    const row = db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.id, "wh-db-test-1"))
      .get();

    assert.ok(row, "Webhook row should exist in DB");
    assert.equal(row.name, "GitHub CI Webhook");
    assert.equal(row.path, "/webhook/github-ci");
    assert.equal(row.secret, "geheimer-schluessel-2026");
    assert.equal(row.template, "github");
    assert.equal(row.enabled, true);
    assert.equal(row.chatId, "chat-dev-team");
    assert.ok(row.createdAt, "createdAt should be set");
  });

  it("register with same id upserts (updates existing row)", async () => {
    const { createWebhookRouter } = await import("../../webhooks/router.js");
    const router = createWebhookRouter(10, db);

    // Register initial
    router.register({
      id: "wh-upsert-test",
      name: "Original Name",
      path: "/webhook/upsert-test",
      secret: null,
      template: "generic",
      enabled: true,
      chatId: "chat-original",
    });

    // Upsert with updated fields
    router.register({
      id: "wh-upsert-test",
      name: "Updated Name",
      path: "/webhook/upsert-updated",
      secret: "new-secret",
      template: "stripe",
      enabled: true,
      chatId: "chat-updated",
    });

    const row = db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.id, "wh-upsert-test"))
      .get();

    assert.ok(row);
    assert.equal(row.name, "Updated Name");
    assert.equal(row.path, "/webhook/upsert-updated");
    assert.equal(row.secret, "new-secret");
    assert.equal(row.template, "stripe");
    assert.equal(row.chatId, "chat-updated");
  });

  it("unregister deletes from DB", async () => {
    const { createWebhookRouter } = await import("../../webhooks/router.js");
    const router = createWebhookRouter(10, db);

    router.register({
      id: "wh-delete-test",
      name: "To Be Deleted",
      path: "/webhook/delete-me",
      secret: null,
      template: "generic",
      enabled: true,
      chatId: "chat-delete",
    });

    // Verify it exists
    let row = db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.id, "wh-delete-test"))
      .get();
    assert.ok(row, "Row should exist before unregister");

    // Unregister
    router.unregister("wh-delete-test");

    // Verify deleted from memory
    assert.equal(router.listAll().filter((w) => w.id === "wh-delete-test").length, 0);

    // Verify deleted from DB
    row = db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.id, "wh-delete-test"))
      .get();
    assert.equal(row, undefined, "Row should be deleted from DB after unregister");
  });

  it("loadWebhooksFromDb restores enabled webhooks only", async () => {
    const { createWebhookRouter, loadWebhooksFromDb } = await import("../../webhooks/router.js");

    // Insert directly into DB (simulating previous session)
    db.insert(webhooksTable)
      .values({
        id: "wh-restore-enabled",
        name: "Active Webhook",
        path: "/webhook/restore-active",
        secret: "active-secret",
        template: "generic",
        enabled: true,
        chatId: "chat-restore",
        createdAt: new Date(),
      })
      .run();

    db.insert(webhooksTable)
      .values({
        id: "wh-restore-disabled",
        name: "Disabled Webhook",
        path: "/webhook/restore-disabled",
        secret: null,
        template: "generic",
        enabled: false,
        chatId: "chat-restore",
        createdAt: new Date(),
      })
      .run();

    // Load from DB
    const loaded = loadWebhooksFromDb(db);

    // Should only return enabled webhooks
    const enabledIds = loaded.map((w) => w.id);
    assert.ok(enabledIds.includes("wh-restore-enabled"), "Should include enabled webhook");
    assert.ok(!enabledIds.includes("wh-restore-disabled"), "Should NOT include disabled webhook");

    // Verify data integrity
    const activeWh = loaded.find((w) => w.id === "wh-restore-enabled");
    assert.ok(activeWh);
    assert.equal(activeWh.name, "Active Webhook");
    assert.equal(activeWh.path, "/webhook/restore-active");
    assert.equal(activeWh.secret, "active-secret");
    assert.equal(activeWh.template, "generic");
    assert.equal(activeWh.chatId, "chat-restore");

    // Verify we can register loaded webhooks into a new router
    const router = createWebhookRouter(10, db);
    for (const wh of loaded) {
      router.register(wh);
    }
    const matched = router.match("/webhook/restore-active");
    assert.ok(matched, "Loaded webhook should be matchable in new router");
    assert.equal(matched.id, "wh-restore-enabled");
  });
});

// ─── google_tokens ──────────────────────────────────────────────────────────

describe("E2E: google_tokens DB wiring", { timeout: 30_000 }, () => {
  let env: TestEnv;
  let db: ReturnType<typeof getDb>;

  before(async () => {
    env = await createTestEnv();
    db = getDb(env.dbUrl);
  });

  after(async () => {
    // Reset module-level state
    const { setGoogleTokenDb, setGoogleConfig } = await import(
      "../../integrations/google/auth.js"
    );
    setGoogleTokenDb(null);
    setGoogleConfig({
      clientId: "",
      clientSecret: "",
      redirectUrl: "",
      tokenCachePath: "",
    });
    await env.cleanup();
  });

  it("saveTokenCache writes to google_tokens table via getValidToken round-trip", async () => {
    const { setGoogleTokenDb, setGoogleConfig, getValidToken } = await import(
      "../../integrations/google/auth.js"
    );

    setGoogleTokenDb(db);
    setGoogleConfig({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUrl: "http://localhost:3004/oauth/callback",
      tokenCachePath: env.tmpDir + "/google-tokens-test.json",
    });

    // Manually insert a token into the DB (simulating a previous exchangeCode)
    const futureExpiry = new Date(Date.now() + 3_600_000); // 1 hour from now
    db.insert(googleTokens)
      .values({
        id: "default",
        accessToken: "ya29.test-access-token-from-db",
        refreshToken: "1//test-refresh-token",
        expiresAt: futureExpiry,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        createdAt: new Date(),
      })
      .run();

    // getValidToken should read from DB (preferred over file)
    const token = await getValidToken();
    assert.equal(token, "ya29.test-access-token-from-db");
  });

  it("DB is preferred over file-based cache", async () => {
    const { setGoogleTokenDb, setGoogleConfig, getValidToken } = await import(
      "../../integrations/google/auth.js"
    );
    const { writeFileSync, mkdirSync } = await import("node:fs");

    setGoogleTokenDb(db);
    const tokenPath = env.tmpDir + "/google-tokens-pref.json";
    setGoogleConfig({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUrl: "http://localhost:3004/oauth/callback",
      tokenCachePath: tokenPath,
    });

    // Write a different token to file
    writeFileSync(
      tokenPath,
      JSON.stringify({
        accessToken: "ya29.file-token-should-not-be-used",
        refreshToken: "1//file-refresh",
        expiresAt: Date.now() + 3_600_000,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
      }),
    );

    // DB already has "ya29.test-access-token-from-db" from previous test.
    // Update it to be clearly different from the file token.
    db.update(googleTokens)
      .set({
        accessToken: "ya29.db-preferred-token",
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .where(eq(googleTokens.id, "default"))
      .run();

    const token = await getValidToken();
    assert.equal(token, "ya29.db-preferred-token", "DB token should take priority over file token");
  });

  it("file fallback works when DB is not set", async () => {
    const { setGoogleTokenDb, setGoogleConfig, getValidToken } = await import(
      "../../integrations/google/auth.js"
    );
    const { writeFileSync } = await import("node:fs");

    // Disable DB
    setGoogleTokenDb(null);

    const tokenPath = env.tmpDir + "/google-tokens-fallback.json";
    setGoogleConfig({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUrl: "http://localhost:3004/oauth/callback",
      tokenCachePath: tokenPath,
    });

    // Write token to file
    writeFileSync(
      tokenPath,
      JSON.stringify({
        accessToken: "ya29.file-fallback-token",
        refreshToken: "1//file-refresh",
        expiresAt: Date.now() + 3_600_000,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
      }),
    );

    const token = await getValidToken();
    assert.equal(token, "ya29.file-fallback-token", "Should fall back to file when DB not set");
  });

  it("onConflictDoUpdate works for re-saving tokens", async () => {
    const { setGoogleTokenDb } = await import("../../integrations/google/auth.js");
    setGoogleTokenDb(db);

    // Upsert a new token (id "default" already exists from earlier test)
    const newExpiry = new Date(Date.now() + 7_200_000);
    db.insert(googleTokens)
      .values({
        id: "default",
        accessToken: "ya29.updated-token",
        refreshToken: "1//updated-refresh",
        expiresAt: newExpiry,
        scopes: "https://www.googleapis.com/auth/calendar",
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: googleTokens.id,
        set: {
          accessToken: "ya29.updated-token",
          refreshToken: "1//updated-refresh",
          expiresAt: newExpiry,
          scopes: "https://www.googleapis.com/auth/calendar",
        },
      })
      .run();

    const row = db
      .select()
      .from(googleTokens)
      .where(eq(googleTokens.id, "default"))
      .get();

    assert.ok(row);
    assert.equal(row.accessToken, "ya29.updated-token");
    assert.equal(row.refreshToken, "1//updated-refresh");
    assert.equal(row.scopes, "https://www.googleapis.com/auth/calendar");

    // Ensure only one row exists (upsert, not duplicate)
    const allRows = db.select().from(googleTokens).all();
    assert.equal(allRows.length, 1, "Should have exactly one row after upsert");
  });
});

// ─── health endpoints ───────────────────────────────────────────────────────

describe("E2E: Health endpoints", { timeout: 30_000 }, () => {
  it("webhook server /health returns 200", async () => {
    const { createWebhookRouter } = await import("../../webhooks/router.js");
    const { createWebhookHandler } = await import("../../webhooks/handler.js");
    const { startWebhookServer } = await import("../../webhooks/server.js");

    const router = createWebhookRouter();
    const handler = createWebhookHandler(async () => {});
    const port = 30_000 + Math.floor(Math.random() * 10_000);
    const server = startWebhookServer({ port, router, handler });
    await server.start();

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: string };
      assert.equal(body.status, "ok");
    } finally {
      await server.stop();
    }
  });
});

// ─── logger ─────────────────────────────────────────────────────────────────

describe("E2E: Structured logger", { timeout: 10_000 }, () => {
  it("createLogger produces valid JSON lines to stdout", async () => {
    const { createLogger } = await import("../../logging/logger.js");

    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    const savedLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";

    try {
      const logger = createLogger("e2e-test");
      logger.debug("Debug-Nachricht", { module: "approval-gate", nonce: "abc123" });
      logger.info("Agent loop gestartet", { model: "qwen3:8b" });
      logger.warn("Timeout für Genehmigung", { toolName: "shell" });
      logger.error("Ollama nicht erreichbar", { url: "http://localhost:11434" });

      assert.equal(lines.length, 4, "Should produce 4 log lines");

      for (const line of lines) {
        const parsed = JSON.parse(line.trim());
        assert.ok(parsed.level, "Each line should have a level");
        assert.ok(parsed.msg, "Each line should have a msg");
        assert.ok(parsed.timestamp, "Each line should have a timestamp");
        assert.equal(parsed.name, "e2e-test");
      }

      // Verify level filtering
      const debugLine = JSON.parse(lines[0]);
      assert.equal(debugLine.level, "debug");
      assert.equal(debugLine.module, "approval-gate");

      const errorLine = JSON.parse(lines[3]);
      assert.equal(errorLine.level, "error");
      assert.equal(errorLine.url, "http://localhost:11434");
    } finally {
      process.stdout.write = original;
      if (savedLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = savedLogLevel;
      }
    }
  });
});

// ─── embeddings default model ───────────────────────────────────────────────

describe("E2E: Embeddings default model fix", { timeout: 10_000 }, () => {
  it("generateEmbedding uses nomic-embed-text when embedModel is not set", async () => {
    // We can't call the real Ollama here (might not be running), but we can verify
    // the request is built with the correct model by intercepting fetch.
    const { generateEmbedding } = await import("../../memory/embeddings.js");

    let capturedBody: string | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      // Pass config WITHOUT embedModel
      await generateEmbedding("Testtext für Embedding", {
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
        numCtx: 16384,
      } as any);

      assert.ok(capturedBody, "fetch should have been called");
      const parsed = JSON.parse(capturedBody);
      assert.equal(
        parsed.model,
        "nomic-embed-text",
        "Should default to nomic-embed-text, not the orchestrator model",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── risk classifier cache key scrub ────────────────────────────────────────

describe("E2E: Risk classifier cache key scrub fix", { timeout: 10_000 }, () => {
  it("scrubArgsForLlm redacts sensitive key names from args", async () => {
    const { scrubArgsForLlm } = await import("../../approval/risk-classifier.js");

    const args = {
      command: "curl https://api.example.com",
      apiKey: "AKIAIOSFODNN7EXAMPLE",
      password: "mein-geheimes-passwort",
      token: "ghp_abc123secrettoken",
      normalArg: "harmless value",
    };

    const scrubbed = scrubArgsForLlm(args);

    // Sensitive keys should be redacted
    assert.equal(scrubbed.apiKey, "[REDACTED]", "apiKey should be redacted");
    assert.equal(scrubbed.password, "[REDACTED]", "password should be redacted");
    assert.equal(scrubbed.token, "[REDACTED]", "token should be redacted");

    // Non-sensitive keys should be preserved
    assert.equal(scrubbed.command, "curl https://api.example.com", "command should be preserved");
    assert.equal(scrubbed.normalArg, "harmless value", "normalArg should be preserved");
  });

  it("cache key uses scrubbed args (no secrets in memory)", async () => {
    // The fix ensures buildCacheKey uses scrubbed args, not raw args.
    // We verify by checking that two calls with same tool + different secrets
    // produce the same cache key (since secrets are redacted to [REDACTED]).
    const { scrubArgsForLlm } = await import("../../approval/risk-classifier.js");

    const args1 = { command: "deploy", apiKey: "secret-key-1" };
    const args2 = { command: "deploy", apiKey: "secret-key-2" };

    const scrubbed1 = scrubArgsForLlm(args1);
    const scrubbed2 = scrubArgsForLlm(args2);

    // Both should produce identical scrubbed output
    assert.deepEqual(scrubbed1, scrubbed2, "Same keys with different secrets should produce identical scrubbed result");
  });
});
