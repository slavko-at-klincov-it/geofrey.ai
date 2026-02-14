/**
 * Isolated test environment: temp directory, temp SQLite DB, minimal config, cleanup.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../../config/schema.js";
import { closeDb } from "../../../db/client.js";
import { setMemoryDir } from "../../../memory/store.js";

export interface TestEnv {
  tmpDir: string;
  dbUrl: string;
  auditDir: string;
  memoryDir: string;
  config: Config;
  cleanup: () => Promise<void>;
}

export async function createTestEnv(overrides?: Partial<Config>): Promise<TestEnv> {
  // Close any previously opened DB singleton to allow re-initialization
  closeDb();

  const tmpDir = await mkdtemp(join(tmpdir(), "geofrey-e2e-"));
  const dbUrl = join(tmpDir, "test.db");
  const auditDir = join(tmpDir, "audit");
  const memoryDir = join(tmpDir, "memory");

  // Point the memory store to our temp dir
  setMemoryDir(memoryDir);

  const config: Config = {
    locale: "de",
    platform: "telegram",
    telegram: { botToken: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi", ownerId: 123456789 },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: process.env.E2E_MODEL ?? "qwen3:8b",
      embedModel: process.env.EMBEDDING_MODEL ?? "nomic-embed-text",
      numCtx: 16384,
    },
    database: { url: dbUrl },
    audit: { logDir: auditDir },
    limits: { maxAgentSteps: 15, approvalTimeoutMs: 300_000, maxConsecutiveErrors: 3 },
    claude: {
      enabled: false,
      skipPermissions: true,
      outputFormat: "stream-json",
      model: "claude-sonnet-4-5-20250929",
      sessionTtlMs: 3_600_000,
      timeoutMs: 600_000,
      defaultDirs: [],
      toolProfiles: {
        readOnly: "Read Glob Grep",
        standard: "Read Glob Grep Edit Write Bash(git:*)",
        full: "Read Glob Grep Edit Write Bash",
      },
    },
    imageSanitizer: { enabled: true, maxInputSizeBytes: 20_971_520, scanForInjection: true },
    dashboard: { enabled: false, port: 3001 },
    search: { provider: "searxng", searxngUrl: "http://localhost:8080" },
    billing: {},
    voice: { sttProvider: "openai" },
    sandbox: {
      enabled: false,
      image: "node:22-slim",
      memoryLimit: "512m",
      networkEnabled: false,
      pidsLimit: 64,
      readOnly: false,
      ttlMs: 1_800_000,
    },
    webhook: { enabled: false, port: 3002, host: "localhost", rateLimit: 60 },
    agents: { enabled: false, routingStrategy: "skill-based", maxConcurrentAgents: 5, sessionIsolation: true },
    tts: { enabled: false, voiceId: "21m00Tcm4TlvDq8ikWAM", cacheLruSize: 100 },
    companion: { enabled: false, wsPort: 3003, pairingTtlMs: 300_000 },
    smartHome: { enabled: false },
    google: { enabled: false, redirectUrl: "http://localhost:3004/oauth/callback", tokenCachePath: join(tmpDir, "google-tokens.json") },
    anonymizer: { enabled: true, llmPass: false, customTerms: [], skipCategories: [] },
    mcp: { allowedServers: [] },
    ...overrides,
  } as Config;

  const cleanup = async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  };

  return { tmpDir, dbUrl, auditDir, memoryDir, config, cleanup };
}
