# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.3.0 - 2026-02-13 (unreleased)

Phase 3 — Differenzierung release. All 5 roadmap features implemented.

### Added

#### Docker Sandbox per Session
- Container lifecycle management (`src/sandbox/container.ts`) — create, exec, destroy, health check via Docker CLI
- Session pool (`src/sandbox/session-pool.ts`) — per-session container mapping with `getOrCreateContainer()`, `destroySession()`, `destroyAllSessions()`
- Volume mounting (`src/sandbox/volume-mount.ts`) — safe mount path validation, host-to-container path translation
- Configurable: image, memory limit, network, PID limit, read-only, TTL
- Docker availability check on startup
- 49 new tests for sandbox module (6 skipped when Docker unavailable)

#### Multi-Model Support via OpenRouter
- Provider interface (`src/models/provider.ts`) — `ModelProvider` abstraction with `generate()`, `stream()`, `getModelInfo()`
- OpenRouter provider (`src/models/openrouter.ts`) — native fetch, SSE streaming, usage token tracking, retryable errors
- Model registry (`src/models/model-registry.ts`) — failover chains (max 3 attempts), task-specific model routing, built-in aliases
- Built-in aliases: `gpt-4o`, `claude-sonnet`, `gemini-pro`, `llama`, `mixtral`, `deepseek-coder`, `qwen`
- 41 new tests for models module

#### Webhook Triggers
- Webhook router (`src/webhooks/router.ts`) — route registry, HMAC-SHA256 authentication, per-webhook rate limiting
- Webhook handler (`src/webhooks/handler.ts`) — event templates (GitHub push/PR/issues, Stripe payment, generic JSON), executor callback
- HTTP server (`src/webhooks/server.ts`) — `node:http` with JSON + form-urlencoded body parsing, authentication middleware
- Webhook tool (`src/tools/webhook.ts`) — create, list, delete, test actions with mock payloads
- `webhooks` table in SQLite schema for persistence
- 37 new tests for webhook module

#### Process Management Tool
- Process manager (`src/process/manager.ts`) — spawn via `execa`, circular log buffer (1000 lines), SIGTERM→SIGKILL escalation (5s grace)
- Process tool (`src/tools/process.ts`) — spawn, list, check, kill, logs actions
- `killAllProcesses()` for graceful shutdown integration
- 18 new tests for process module

#### TTS via ElevenLabs
- Speech synthesizer (`src/voice/synthesizer.ts`) — ElevenLabs API client, LRU audio cache (SHA-256 keys), configurable voice/model
- Text splitter — sentence-boundary splitting for texts >5000 characters
- TTS tool (`src/tools/tts.ts`) — `tts_speak` action with `getLastSynthesizedAudio()` for platform delivery
- Optional `sendAudio()` method added to `MessagingPlatform` interface
- Tests for synthesizer module

#### Config & Infrastructure
- New config sections: `sandbox`, `models`, `webhook`, `tts` in Zod schema
- New env vars: `SANDBOX_ENABLED/IMAGE/MEMORY_LIMIT/NETWORK/PIDS_LIMIT/READ_ONLY/TTL_MS`, `OPENROUTER_API_KEY/DEFAULT_MODEL/FAILOVER_CHAIN/TASK_MODELS`, `WEBHOOK_ENABLED/PORT/HOST/RATE_LIMIT`, `ELEVENLABS_API_KEY/VOICE_ID/MODEL/CACHE_SIZE`
- ~20 new i18n keys across process, tts, sandbox, webhook categories (German + English)
- Risk classifier updated: `tts_speak`=L0, `process_manager` action-based (list/check/logs=L0, spawn/kill=L2), `webhook` action-based (list/test=L0, create=L1, delete=L2)
- Graceful shutdown: `killAllProcesses()`, `destroyAllSessions()`, webhook server stop
- 731 total tests (up from 575), 0 failures

## 1.2.0 - 2026-02-13 (unreleased)

Phase 2 — Power Features release. All 5 roadmap features implemented.

### Added

#### Browser Automation (Chrome DevTools Protocol)
- Chrome binary discovery for macOS, Linux, Windows (`src/browser/launcher.ts`)
- CDP session management — launch, connect to existing, close, close all
- Accessibility tree extraction (`src/browser/snapshot.ts`) — `getFullAXTree()`, node-by-role/text search
- Browser actions (`src/browser/actions.ts`) — navigate, click (via AX nodeId → coordinates), fill, screenshot, evaluate, waitForSelector
- Browser tool (`src/tools/browser.ts`) with 9 actions: launch, navigate, click, fill, screenshot, evaluate, snapshot, waitForSelector, close
- Temporary profile directory with auto-cleanup on close
- 37 new tests for browser module

#### Skill System (SKILL.md)
- SKILL.md format (`src/skills/format.ts`) — YAML frontmatter (Zod-validated) + plain text instructions
- Minimal YAML parser supporting strings, arrays, nested objects, quoted values
- 4-axis permission manifest: filesystem (none/read/write), network (none/local/full), env (none/read), exec (none/restricted/full)
- Skill registry (`src/skills/registry.ts`) — discover from `~/.geofrey/skills/` (global) + `.geofrey/skills/` (local), local overrides global
- `buildSkillContext()` (`src/skills/injector.ts`) — wraps enabled skills in `<skill>` XML tags for system prompt injection
- Skill tool (`src/tools/skill.ts`) with actions: list, install (URL/path), enable, disable, generate
- Auto-generation of new skills from name + description + instructions
- Skills loaded on startup via `discoverSkills()` in `index.ts`
- 30 new tests for skill module

#### Slack + Discord Adapters
- Slack adapter (`src/messaging/adapters/slack.ts`) — `@slack/bolt` Socket Mode, Block Kit approval buttons, mrkdwn formatting
- Discord adapter (`src/messaging/adapters/discord.ts`) — `discord.js` Gateway Intents, `ButtonBuilder` approval components
- Config sections: `slack` (botToken, appToken, channelId), `discord` (botToken, channelId)
- Platform factory updated for `slack` and `discord` cases
- Onboarding wizard steps for Slack and Discord setup
- Platform selection expanded to include Slack and Discord
- 17 new tests for Slack and Discord adapters

#### Voice Messages / STT (Whisper)
- Voice transcriber (`src/voice/transcriber.ts`) — dual provider: OpenAI Whisper API (`whisper-1`) + local whisper.cpp (`whisper-cli`)
- Audio converter (`src/voice/converter.ts`) — ffmpeg via execa, converts OGG/OPUS/MP4/M4A/WebM/MP3/AAC/FLAC to WAV 16kHz mono
- `VoiceAttachment` interface and `onVoiceMessage` callback in `PlatformCallbacks`
- Voice message handling in Telegram (voice + audio), WhatsApp (audio), Signal (voice attachments)
- Voice processing pipeline in `index.ts`: send "transcribing" → convert if needed → transcribe → forward as text
- Config section: `voice` (sttProvider, openaiApiKey, whisperModelPath)
- 25 new tests for voice module

#### Session Compaction
- Token counter (`src/orchestrator/compaction/token-counter.ts`) — ~4 chars/token estimation, context usage %, shouldCompact threshold
- Compactor (`src/orchestrator/compaction/compactor.ts`) — Ollama-based message summarization, pre-compaction memory flush via `flushToMemory()`
- Pruner (`src/orchestrator/compaction/pruner.ts`) — tool result truncation (>500 chars → 200 + [truncated]), old/recent message splitting
- `compactMessages()` and `getTokenCount()` added to conversation manager
- `/compact` command handler in agent-loop.ts for manual compaction
- Auto-compaction check before each `streamText()` call (triggers at 75% context usage)
- 36 new tests for compaction module

#### Config & Infrastructure
- New config sections: `slack`, `discord`, `voice` in Zod schema
- `"slack"` and `"discord"` added to platform enum with validation refinements
- New env vars: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `STT_PROVIDER`, `OPENAI_API_KEY`, `WHISPER_MODEL_PATH`
- ~38 new i18n keys across browser, skills, slack, discord, voice, compaction categories (German + English)
- Browser shutdown (`closeAllBrowsers()`) added to graceful shutdown handler
- 575 total tests (up from 430), 0 failures

## 1.1.0 - 2026-02-13 (unreleased)

Phase 1 — Essentials release. All 5 roadmap features implemented.

### Added

#### Image Upload Support
- Image upload support across all messaging adapters (Telegram photos/documents, WhatsApp media, Signal attachments)
- Image processing pipeline (`src/messaging/image-handler.ts`) — sanitize, OCR text extraction via tesseract.js, store sanitized files, forward text description to orchestrator
- `ImageAttachment` interface and `onImageMessage` callback in `PlatformCallbacks`
- `data/images/` storage directory for sanitized images
- 5 new i18n keys (`messaging.image*`) with German and English translations
- 5 new tests for image handler

#### Web Dashboard + WebChat
- WebChat messaging adapter (`src/messaging/adapters/webchat.ts`) implementing full `MessagingPlatform` interface
- Native `node:http` server with SSE (Server-Sent Events) for real-time message streaming
- REST API endpoints: `/api/events` (SSE), `/api/message`, `/api/approval/:nonce`, `/api/status`, `/api/audit`
- Bearer token authentication via `DASHBOARD_TOKEN` env var
- Single-page chat UI (`src/dashboard/public/`) with dark theme, markdown rendering, approval buttons
- Mobile-responsive design with sidebar navigation
- Static file serving for dashboard assets
- Selectable via `PLATFORM=webchat` or as standalone with `DASHBOARD_ENABLED=true`
- 18 new tests for WebChat adapter

#### Persistent Memory
- Memory store (`src/memory/store.ts`) — read/write/append to `data/memory/MEMORY.md`, daily notes support
- Ollama embeddings integration (`src/memory/embeddings.ts`) — `generateEmbedding()` via `/api/embed` endpoint
- Text chunking (~400 tokens) with cosine similarity search
- `memory_chunks` table in SQLite for embedding storage
- Auto-recall (`src/memory/recall.ts`) — semantic search with 0.7 similarity threshold, injects context into orchestrator prompt
- Three new tools: `memory_read` (L0), `memory_write` (L1), `memory_search` (L0)
- Drizzle migration `0003_add_memory_chunks.sql`
- 24 new tests for memory store and embeddings

#### Web Search + Web Fetch
- Web search tool (`src/tools/web-search.ts`) with two providers: SearXNG (self-hosted, default) and Brave Search API
- `setSearchConfig()` for runtime provider configuration
- Web fetch tool (`src/tools/web-fetch.ts`) with custom HTML→Markdown converter
- `htmlToMarkdown()` strips scripts/nav/footer/header/aside, converts headings/links/code/lists
- `decodeEntities()` handles named + numeric + hex HTML entities
- Both tools classified as L0 (AUTO_APPROVE) — read-only internet access
- 49 new tests for web search and web fetch

#### Cron/Scheduler
- 5-field cron expression parser (`src/automation/cron-parser.ts`) — minute, hour, day, month, weekday with `*`, ranges, steps, comma-separated values
- Persistent job scheduler (`src/automation/scheduler.ts`) — 30-second tick loop, SQLite-backed via `cron_jobs` table
- Exponential retry backoff on failure (30s → 1m → 5m → 15m → 60m, max 5 retries)
- Cron tool (`src/tools/cron.ts`) with create/list/delete actions
- `initScheduler()` / `stopScheduler()` lifecycle management
- Drizzle migration `0001_add_cron_jobs.sql`
- 29 new tests for cron parser and scheduler (scheduler tests skip gracefully when better-sqlite3 unavailable)

#### Cost Tracking / Billing
- Model pricing table (`src/billing/pricing.ts`) — built-in rates for Claude Sonnet/Opus/Haiku + Ollama ($0)
- Per-request usage logger (`src/billing/usage-logger.ts`) — logs model, input/output tokens, cost (USD), chat ID to `usage_log` table
- Daily usage aggregation via `getDailyUsage()` query
- Budget monitor (`src/billing/budget-monitor.ts`) — alerts at 50%, 75%, 90% of `MAX_DAILY_BUDGET_USD`
- Integration in `buildOnStepFinish()` — orchestrator and Claude Code usage logged after each AI SDK step
- Drizzle migration `0002_add_usage_log.sql`
- 28 new tests for pricing, usage logger, and budget monitor

#### Config & Infrastructure
- New config sections: `dashboard`, `search`, `billing` in Zod schema
- `"webchat"` added to platform enum with validation refinement (requires `dashboard.enabled`)
- New env vars: `DASHBOARD_ENABLED`, `DASHBOARD_PORT`, `DASHBOARD_TOKEN`, `SEARCH_PROVIDER`, `SEARXNG_URL`, `BRAVE_API_KEY`, `MAX_DAILY_BUDGET_USD`
- 23 new i18n keys across cron, memory, search, billing, and dashboard categories (German + English)
- `web_search`, `web_fetch`, `memory_read`, `memory_search` added to L0_TOOLS in risk classifier
- DB schema versions 1-4 registered in `client.ts`
- 3 new Drizzle migrations with full snapshots
- 430 total tests (up from 225), 0 failures

## 1.0.1 - 2026-02-12 (release deleted)

### Added

- Image metadata sanitizer (`src/security/image-sanitizer.ts`) — strips EXIF/XMP/IPTC/PNG text chunks before images reach the LLM
- Format detection via magic bytes (JPEG, PNG, WebP, TIFF, GIF)
- Prompt injection scanning in raw metadata buffers (instruction phrases, XML tag injection, jailbreak keywords, DAN patterns)
- EXIF orientation applied before metadata stripping
- Audit log helper for image sanitization with risk escalation (clean = L0, suspicious = L2)
- Config section `imageSanitizer` with env vars: `IMAGE_SANITIZER_ENABLED`, `IMAGE_SANITIZER_MAX_SIZE`, `IMAGE_SANITIZER_SCAN_INJECTION`
- 8 new i18n keys (`security.*`) with German and English translations
- 37 new tests for image sanitizer (257 total across 59 suites)

### Security

- Image metadata side channel defense — prevents prompt injection via EXIF/XMP/IPTC fields

## 1.0.0 - 2026-02-12 (release deleted)

### Added

- Local LLM orchestrator using Qwen3 8B via Ollama (configurable via `ORCHESTRATOR_MODEL`)
- Vercel AI SDK 6 integration with ToolLoopAgent and streamText for agent loop
- Hybrid risk classification (L0-L3) combining deterministic pattern matching (~90%) with LLM fallback (~10%)
- Promise-based approval gate that blocks execution until user confirms (nonce-based IDs)
- Action registry with escalation rules and execution guard with final revocation check
- Multi-platform messaging abstraction (MessagingPlatform interface) with three adapters:
  - Telegram via grammy with inline approval buttons and live streaming edits
  - WhatsApp Business Cloud API with interactive buttons (max 3)
  - Signal via signal-cli JSON-RPC with text-based approvals
- Claude Code CLI driver with stream-json output, session management, and tool scoping
- Risk-scoped tool profiles (L0: readOnly, L1: standard, L2: full) for Claude Code subprocess
- Prompt generator with 8 task templates, 4-way intent classification (QUESTION/SIMPLE_TASK/CODING_TASK/AMBIGUOUS)
- MCP client for 10K+ tool servers with risk classifier wrapping and server allowlist
- Native tool executors for shell commands, filesystem operations, and git
- Hash-chained JSONL audit log (SHA-256) with session tracking, cost, and token usage
- SQLite persistence via better-sqlite3 with Drizzle ORM and migration support
- Schema version tracking table for future database migrations
- Interactive setup wizard (`pnpm setup`) with auto-detection, OCR token extraction, and clipboard support
- Onboarding startup check for Claude Code CLI availability and authentication status
- ANTHROPIC_API_KEY support as alternative to Claude Code subscription
- i18n infrastructure with ~150 typed translation keys, German and English locales, and `t()` function
- Bilingual language selection at wizard start, configurable via LOCALE env var
- 220 tests total: 188 unit tests (node:test runner, co-located .test.ts files) and 32 E2E integration tests
- GitHub Actions CI workflow (Node 22, pnpm, lint + test)
- MIT license
- Comprehensive documentation: ARCHITECTURE.md, ORCHESTRATOR_PROMPT.md, README.md

### Fixed

- Claude Code output token limit handling with retry logic and raised cap
- Tool executor error recovery (returns error string instead of throwing)
- In-flight request tracking on every tool execution
- Audit log uses actual risk classification result instead of hardcoded value
- LLM risk classifier retries up to 2x with JSON regex extraction fallback
- Agent loop catches top-level errors and returns user-friendly message
- CONFIG_FILES regex allowing package.json, tsconfig.json, Dockerfile (no leading dot required)
- TypeScript narrowing error in MCP client test
- Ollama connection errors with 3 retries and user-friendly messages
- Startup config errors with human-readable Zod messages and env var mapping

### Security

- Obfuscation-resistant L3 block patterns (path variants, script-language network calls, base64 decode, chmod +x, process substitution)
- Shlex-style command decomposition preventing chained command bypass (e.g., `ls && curl evil`)
- MCP output sanitization with DATA boundary tags and instruction filtering
- MCP server allowlist via `mcp.allowedServers` config and MCP_ALLOWED_SERVERS env var
- MCP response validation using Zod schema instead of unsafe type assertions
- XML-based LLM classifier output format (more reliable with Qwen3 8B, JSON fallback)
- Filesystem directory confinement rejecting paths outside `process.cwd()`
- 3-layer prompt injection defense isolating user input, tool output, and model response
- Detection of cmd.exe, powershell.exe, and pwsh.exe as L3 bare shells
- Signal adapter rejects pending JSON-RPC requests on graceful shutdown
- Unhandled rejection handler in entry point

### Changed

- Windows compatibility for shell executor (cmd /c instead of sh -c)
- Windows compatibility for setup wizard (PowerShell SnippingTool OCR, clipboard capture)
- Windows compatibility for Signal adapter (named pipe default `\\.\pipe\signal-cli`)
- Windows compatibility for prerequisites check (cmd start /b for detached Ollama)
- Platform-aware defaults for Signal socket path in config schema

<!-- No GitHub releases published yet. Versions are internal milestones. -->
