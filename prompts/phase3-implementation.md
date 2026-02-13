# Phase 3 — Differenzierung (v1.3) Implementation Prompt

> Copy this entire prompt into a Claude Code session.

---

## Mission

Implement all 5 features of Phase 3 (v1.3) for the Geofrey AI agent project. Use **subagents** (Task tool) to implement each feature in parallel, then combine, test, and document everything.

## Context

Geofrey is an open-source personal AI agent with a local LLM orchestrator (Qwen3 8B via Ollama). Phase 1 (v1.1) and Phase 2 (v1.2) are fully complete. You are implementing Phase 3.

**Read these files first** (mandatory, do NOT skip):
- `CLAUDE.md` — project context, conventions, full file structure
- `docs/ARCHITECTURE.md` — system design
- `docs/OPENCLAW_GAP_ANALYSIS.md` — feature specs from gap analysis
- `src/config/schema.ts` + `src/config/defaults.ts` — config patterns
- `src/tools/tool-registry.ts` — tool registration pattern
- `src/approval/risk-classifier.ts` — risk classification patterns
- `src/i18n/locales/de.ts` + `src/i18n/locales/en.ts` — i18n key patterns
- `src/i18n/keys.ts` — translation key type
- `src/messaging/platform.ts` — messaging platform interface
- `src/index.ts` — how everything is wired together
- `package.json` — current dependencies

## The 5 Features

### Feature 1: Docker Sandbox per Session
**Files to create:**
- `src/sandbox/container.ts` — Docker container lifecycle (create, exec, destroy, health check)
- `src/sandbox/session-pool.ts` — Per-session container pool (Map<sessionId, containerId>), auto-cleanup on TTL
- `src/sandbox/volume-mount.ts` — Safe volume mounting (cwd only, read-only option, no host path traversal)
- `src/sandbox/container.test.ts`
- `src/sandbox/session-pool.test.ts`
- `src/sandbox/volume-mount.test.ts`

**Implementation details:**
- Use `execa` to manage Docker CLI (`docker run`, `docker exec`, `docker rm`, `docker inspect`)
- Do NOT add dockerode as dependency — keep it lightweight via CLI
- Container image: configurable via `SANDBOX_IMAGE` env var (default: `node:22-slim`)
- Each session gets an isolated container with: network disabled by default (`--network=none`), memory limit (`--memory=512m`), no privileged mode, PID limit (`--pids-limit=64`)
- Volume mount: only `process.cwd()` mounted at `/workspace`, configurable read-only
- Container auto-destruction after session TTL (default 30 min, configurable via `SANDBOX_TTL_MS`)
- Health check via `docker inspect --format='{{.State.Running}}'`
- Shell tool integration: when sandbox enabled, `shell.ts` should route commands through `docker exec <containerId>` instead of local `execa`
- Risk classification: `sandbox_exec` tool = L1, `sandbox_destroy` = L2

**Config additions (`src/config/schema.ts`):**
```typescript
sandbox: z.object({
  enabled: z.boolean().default(false),
  image: z.string().default("node:22-slim"),
  memoryLimit: z.string().default("512m"),
  networkEnabled: z.boolean().default(false),
  ttlMs: z.coerce.number().int().default(1_800_000), // 30 min
  pidsLimit: z.coerce.number().int().default(64),
  readOnly: z.boolean().default(false),
}).default({})
```

**Env vars:** `SANDBOX_ENABLED`, `SANDBOX_IMAGE`, `SANDBOX_MEMORY_LIMIT`, `SANDBOX_NETWORK`, `SANDBOX_TTL_MS`, `SANDBOX_PIDS_LIMIT`, `SANDBOX_READ_ONLY`

**i18n keys:** `sandbox.created`, `sandbox.destroyed`, `sandbox.execError`, `sandbox.healthFailed`, `sandbox.ttlExpired`, `sandbox.dockerNotFound`

---

### Feature 2: Multi-Model Support via OpenRouter
**Files to create:**
- `src/models/openrouter.ts` — OpenRouter provider (API key auth, model routing, streaming support)
- `src/models/model-registry.ts` — Model registry (name → provider mapping, failover chains)
- `src/models/provider.ts` — Provider interface (generate, stream, getModelInfo)
- `src/models/openrouter.test.ts`
- `src/models/model-registry.test.ts`

**Implementation details:**
- OpenRouter uses the OpenAI-compatible API format (`https://openrouter.ai/api/v1/chat/completions`)
- Use native `fetch` (no openai SDK) — POST with `Authorization: Bearer <key>`, `X-Title: Geofrey`, `HTTP-Referer: https://github.com/geofrey-ai`
- Vercel AI SDK 6 custom provider: implement `LanguageModelV1` interface from `ai` package so it plugs into existing `generateText`/`streamText` calls
- Model registry maps friendly names → OpenRouter model IDs (e.g., `gpt-4o` → `openai/gpt-4o`, `gemini-pro` → `google/gemini-2.0-flash`)
- Failover chain: ordered list of models, try next on 429/500/502/503 (max 3 attempts)
- Per-task model routing: config allows setting model per task type (`orchestrator`, `classifier`, `coder`, `summarizer`)
- Streaming: SSE parsing for streamed responses (OpenRouter supports SSE like OpenAI)
- Cost tracking integration: OpenRouter returns usage in response headers (`x-ratelimit-*`) and body (`usage.prompt_tokens`, `usage.completion_tokens`) — feed into existing `billing/usage-logger.ts`

**Config additions:**
```typescript
models: z.object({
  openrouterApiKey: z.string().optional(),
  defaultModel: z.string().default("ollama/qwen3:8b"),
  taskModels: z.record(z.string()).default({}), // e.g., { coder: "openai/gpt-4o", summarizer: "ollama/qwen3:8b" }
  failoverChain: z.array(z.string()).default([]),
}).default({})
```

**Env vars:** `OPENROUTER_API_KEY`, `DEFAULT_MODEL`, `TASK_MODELS` (JSON), `FAILOVER_CHAIN` (comma-separated)

**i18n keys:** `models.openrouterError`, `models.failoverSwitch`, `models.rateLimited`, `models.modelNotFound`, `models.apiKeyMissing`

---

### Feature 3: Webhook Triggers
**Files to create:**
- `src/webhooks/server.ts` — HTTP server (node:http) for incoming webhooks
- `src/webhooks/router.ts` — Route registry (path → handler mapping, authentication)
- `src/webhooks/handler.ts` — Webhook event → orchestrator message pipeline
- `src/webhooks/server.test.ts`
- `src/webhooks/router.test.ts`
- `src/webhooks/handler.test.ts`
- `src/tools/webhook.ts` — Tool for managing webhooks (create/list/delete/test)

**Implementation details:**
- Use `node:http` (no Express) — lightweight HTTP server
- Configurable port via `WEBHOOK_PORT` (default: 3001, separate from dashboard port)
- Each webhook gets a unique path: `/webhook/<id>` with optional secret token (HMAC-SHA256 validation)
- Webhook registration stored in SQLite (add `webhooks` table to `src/db/schema.ts`)
- When webhook fires: validate auth → parse body → create orchestrator message → run agent loop
- Support JSON and form-urlencoded payloads
- Built-in templates for common triggers: GitHub (push, PR, issue), Stripe (payment), generic JSON
- Rate limiting: max 10 requests/min per webhook (in-memory counter, configurable)
- The `webhook` tool allows the orchestrator to CRUD webhooks:
  - `create`: name, optional template, optional secret
  - `list`: show all registered webhooks with URLs
  - `delete`: remove by ID
  - `test`: fire a test event

**DB schema addition:**
```typescript
export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(), // nanoid
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  secret: text("secret"), // HMAC secret (nullable)
  template: text("template"), // "github", "stripe", "generic"
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

**Risk classification:** `webhook_create` = L1, `webhook_delete` = L2

**Config:** `WEBHOOK_ENABLED` (default: false), `WEBHOOK_PORT` (default: 3001), `WEBHOOK_RATE_LIMIT` (default: 10)

**i18n keys:** `webhook.created`, `webhook.deleted`, `webhook.fired`, `webhook.authFailed`, `webhook.rateLimited`, `webhook.serverStarted`, `webhook.disabled`

---

### Feature 4: Process Management Tool
**Files to create:**
- `src/tools/process.ts` — Process management tool (list, check, kill, spawn)
- `src/process/manager.ts` — Process tracker (spawn → track PID → monitor → cleanup)
- `src/process/manager.test.ts`

**Implementation details:**
- Use `execa` for spawning and `node:child_process` for `process.kill()`
- Track spawned processes in a Map<pid, ProcessInfo> (name, command, startedAt, status)
- Tool actions:
  - `list`: show tracked processes (pid, name, uptime, status)
  - `check <pid>`: check if process is still running (via `kill(pid, 0)`)
  - `kill <pid>`: send SIGTERM, wait 5s, then SIGKILL if still alive
  - `spawn <command>`: start a background process, track it, return PID
  - `logs <pid>`: return last N lines of stdout/stderr (ring buffer, 1000 lines default)
- Security: spawned processes inherit sandbox container if sandbox is enabled
- Cleanup: all tracked processes killed on graceful shutdown (register in `src/index.ts`)
- Log capture: pipe stdout/stderr to ring buffer per process

**Risk classification:**
- `process_list` = L0, `process_check` = L0
- `process_spawn` = L2 (starts a new process)
- `process_kill` = L2 (terminates a process)
- `process_logs` = L0

**i18n keys:** `process.spawned`, `process.killed`, `process.notFound`, `process.alreadyStopped`, `process.forceKilled`

---

### Feature 5: TTS via ElevenLabs
**Files to create:**
- `src/voice/synthesizer.ts` — ElevenLabs TTS API client (text → audio buffer)
- `src/voice/synthesizer.test.ts`
- `src/tools/tts.ts` — TTS tool for orchestrator (speak action)

**Implementation details:**
- ElevenLabs API: `POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>`
- Use native `fetch` — no SDK dependency
- Request body: `{ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }`
- Response: raw audio bytes (mp3) — save to temp file, send via messaging platform
- Voice ID configurable via `ELEVENLABS_VOICE_ID` (default: "21m00Tcm4TlvDq8ikWAM" = Rachel)
- Platform integration: extend `MessagingPlatform` interface with optional `sendAudio(chatId, audioBuffer, filename): Promise<void>`
  - Telegram: `bot.api.sendVoice()`
  - WhatsApp: upload media → send audio message
  - Signal: `signal-cli sendMessage --attachment`
  - Discord: send as attachment
  - Slack: `files.uploadV2`
  - WebChat: base64-encoded audio in SSE event
- Implement each adapter's `sendAudio` method
- Max text length: 5000 chars (ElevenLabs limit) — split longer texts
- Cache: optional LRU cache for repeated phrases (Map<hash, Buffer>, max 50 entries, configurable)
- Fallback: if ElevenLabs unavailable, return text message with note "TTS unavailable"

**Config additions:**
```typescript
tts: z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["elevenlabs"]).default("elevenlabs"),
  apiKey: z.string().optional(),
  voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  model: z.string().default("eleven_multilingual_v2"),
  cacheSize: z.coerce.number().int().default(50),
}).default({})
```

**Env vars:** `TTS_ENABLED`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `TTS_CACHE_SIZE`

**Risk classification:** `tts_speak` = L0 (read-only, just generates audio)

**i18n keys:** `tts.synthesizing`, `tts.sent`, `tts.tooLong`, `tts.apiError`, `tts.unavailable`, `tts.apiKeyMissing`

---

## Implementation Strategy

### Step 1: Read & Understand (mandatory)
Read ALL the files listed in the Context section above. Do not start coding until you understand the patterns.

### Step 2: Parallel Implementation (5 subagents via Task tool)
Use the **Task tool** with `subagent_type: "general-purpose"` to launch **5 subagents in a single message** (this makes them run in parallel). Each subagent prompt must:
- Start with: "Read `CLAUDE.md`, `src/tools/tool-registry.ts`, `src/config/schema.ts`, and `src/config/defaults.ts` first to understand conventions."
- Include the full feature spec (copy the relevant Feature section from this prompt into the subagent's prompt)
- End with: "Only create files in your feature directory + your tool file. Do NOT edit shared files (i18n, config, index.ts, risk-classifier.ts, platform.ts) — those are handled in the integration step."

**Subagent 1:** Docker Sandbox → creates `src/sandbox/*.ts` + `src/tools/sandbox.ts` (Feature 1 spec)
**Subagent 2:** Multi-Model/OpenRouter → creates `src/models/*.ts` (Feature 2 spec)
**Subagent 3:** Webhook Triggers → creates `src/webhooks/*.ts` + `src/tools/webhook.ts` (Feature 3 spec)
**Subagent 4:** Process Management → creates `src/process/*.ts` + `src/tools/process.ts` (Feature 4 spec)
**Subagent 5:** TTS/ElevenLabs → creates `src/voice/synthesizer.ts` + `src/tools/tts.ts` (Feature 5 spec)

**Critical:** All 5 Task tool calls MUST be in a single message so they execute in parallel. Each subagent creates ONLY its own files — no shared file edits.

### Step 3: Integration (sequential, after all subagents complete)
After all 5 subagents finish:

1. **Config integration** — merge all new config sections into `src/config/schema.ts` and `src/config/defaults.ts`
2. **DB schema** — add webhook table to `src/db/schema.ts`
3. **Risk classifier** — add new tool patterns to `src/approval/risk-classifier.ts`
4. **Tool registration** — add imports to `src/index.ts` for all new tools
5. **Platform interface** — add `sendAudio` to `MessagingPlatform` interface and implement in all adapters
6. **Shell integration** — wire sandbox into `src/tools/shell.ts` when sandbox is enabled
7. **i18n merge** — ensure no duplicate keys, all keys in both locales
8. **Graceful shutdown** — register sandbox cleanup and process cleanup in `src/index.ts`
9. **Run `pnpm lint`** (tsc --noEmit) — fix ALL type errors
10. **Run `pnpm test`** — fix ALL failing tests (existing + new)

### Step 4: Documentation (after integration passes)
Update these files:

1. **`CLAUDE.md`** — update:
   - Project Status: check off all Phase 3 items
   - Project Structure: add new files/directories
   - Key Decisions Log: add decisions for each feature
   - Bump version reference to v1.3
   - Tech Stack: add OpenRouter, ElevenLabs, Docker sandbox

2. **`docs/ARCHITECTURE.md`** — add:
   - Docker Sandbox section (container lifecycle, security model)
   - Multi-Model section (provider abstraction, failover)
   - Webhook Triggers section (HTTP flow, auth)
   - Process Management section
   - TTS section (synthesis flow, platform delivery)
   - Update the Core Flow diagram to include sandbox and webhooks

3. **`docs/OPENCLAW_GAP_ANALYSIS.md`** — update:
   - Change all Phase 3 items from ❌ to ✅
   - Add Geofrey implementation details

4. **`CHANGELOG.md`** — add v1.3.0 entry with all 5 features

5. **`package.json`** — bump version to `1.3.0`

6. **`.env.example`** — add all new env vars with comments

## Critical Conventions (DO NOT VIOLATE)

- **ESM only** — all imports use `.js` extension (`import { x } from "./y.js"`)
- **No classes** — use functions + closures
- **Zod for validation** — all external input validated
- **node:test + assert/strict** — for all tests
- **Functional error handling** — tool execute functions return strings, never throw
- **i18n** — every user-facing string goes through `t()`, both `de` and `en`
- **No default exports** — named exports only
- **SCREAMING_SNAKE_CASE** for constants
- **camelCase** for functions, **PascalCase** for types
- **kebab-case** for file names
- **Co-located tests** — `feature.test.ts` next to `feature.ts`
- **Strict TypeScript** — no `any`, no `as` casts unless absolutely necessary
- **No new heavy dependencies** — use `execa` (already installed), native `fetch`, `node:http`
- **Risk classification** — every new tool action must have a risk level

## Acceptance Criteria

- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm test` passes with all tests green (existing + new)
- [ ] All 5 features have comprehensive tests
- [ ] All i18n keys present in both de and en
- [ ] All config properly wired with env vars
- [ ] All docs updated accurately
- [ ] Docker sandbox can be enabled/disabled via config
- [ ] OpenRouter can be used as alternative to Ollama
- [ ] Webhooks can be created and triggered via HTTP
- [ ] Processes can be spawned, listed, and killed
- [ ] TTS generates audio and sends via all messaging platforms
- [ ] Version bumped to 1.3.0
