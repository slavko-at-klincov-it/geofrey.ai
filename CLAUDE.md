# openClawNurBesser

## Overview
A better alternative to [OpenClaw](https://github.com/openclaw/openclaw) (formerly Clawdbot/Moltbot) — an open-source personal AI agent with a **local LLM as orchestrator** that acts as a safety layer, prompt optimizer, and user communication bridge.

## Core Concept
1. **Local LLM Orchestrator** (Qwen3 8B via Ollama, configurable via `ORCHESTRATOR_MODEL`) — reviews and approves actions before execution
2. **User Confirmation via Messaging** — "Do you really want to delete these photos?" via Telegram
3. **Hybrid Risk Classification** — deterministic patterns + LLM for ambiguous cases
4. **MCP Integration** — access 10K+ tool servers, wrapped by our safety layer
5. **Resource Efficient** — local inference instead of expensive cloud API loops ($200-600/mo with OpenClaw)

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Language | **TypeScript** (Node.js ≥22) |
| Orchestrator LLM | **Qwen3 8B** via Ollama (default, configurable via `ORCHESTRATOR_MODEL`) |
| Code Worker (coming soon) | **Qwen3-Coder-Next** via Ollama — 80B MoE / 3B active, 70.6% SWE-Bench (64GB+ RAM) |
| LLM SDK | **Vercel AI SDK 6** (`ai` + `ai-sdk-ollama`) — ToolLoopAgent, needsApproval |
| Tool Integration | **MCP Client** (`@modelcontextprotocol/sdk`) wrapped by risk classifier |
| Messaging | **grammY** (Telegram) · **Cloud API** (WhatsApp) · **signal-cli** (Signal) · **@slack/bolt** (Slack) · **discord.js** (Discord) |
| Subprocess | **execa** |
| State/DB | **SQLite** (better-sqlite3 + **Drizzle ORM**) |
| Audit | Append-only hash-chained **JSONL** (SHA-256) |
| Image Processing | **sharp** (metadata stripping, format detection, orientation) |
| Validation | **Zod** (Standard Schema compatible) |
| Package Manager | **pnpm** |
| i18n | Typed key-value maps (`src/i18n/`) — `t()` function, `de` + `en` locales |
| Code language | English |
| Communication | German (default), English (configurable via `LOCALE`) |

## Architecture
See `docs/ARCHITECTURE.md` for full details.

### Core Flow
```
User (Telegram) → Orchestrator (Qwen3 8B) → Hybrid Risk Classifier (L0-L3)
                        ↕                          ↓
                  Approval Gate ◄── L2: blocks until user approves (Promise)
                        ↓
                  Tool Executors (Claude Code, shell, filesystem, git, MCP)
                        ↓
                  Audit Log (hash-chained JSONL)
```

### Risk Levels
| Level | Name | Behavior |
|-------|------|----------|
| L0 | AUTO_APPROVE | Execute immediately (reads, searches) |
| L1 | NOTIFY | Execute + inform user (safe writes, non-config) |
| L2 | REQUIRE_APPROVAL | **Block until user taps Approve** (deletes, commits, installs) |
| L3 | BLOCK | Refuse always (rm -rf, sudo, curl\|sh, push --force) |

## Key Files
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context (this file, auto-loaded) |
| `docs/ARCHITECTURE.md` | Full architecture with diagrams |
| `docs/ORCHESTRATOR_PROMPT.md` | System prompts for Qwen3 orchestrator (3 focused prompts) |
| `src/` | Source code (TypeScript) |
| `system_prompts_leaks-main/` | Reference: 109 leaked system prompts |
| `src/onboarding/check.ts` | Claude Code startup check + onboarding messages |

## Project Structure
```
src/
├── index.ts                 # Entry point + graceful shutdown
├── orchestrator/
│   ├── agent-loop.ts        # Vercel AI SDK ToolLoopAgent wrapper
│   ├── conversation.ts      # Multi-turn conversation manager
│   ├── prompt-generator.ts  # Task templates for downstream models
│   └── compaction/
│       ├── token-counter.ts # Token estimation + context usage tracking
│       ├── compactor.ts     # Ollama-based summarization + memory flush
│       ├── pruner.ts        # Tool result truncation + old message splitting
│       ├── token-counter.test.ts
│       ├── compactor.test.ts
│       └── pruner.test.ts
├── approval/
│   ├── risk-classifier.ts   # Hybrid: deterministic patterns + LLM fallback
│   ├── approval-gate.ts     # Promise-based blocking gate (nonce IDs)
│   ├── action-registry.ts   # Action definitions + escalation rules
│   └── execution-guard.ts   # Final revocation check
├── messaging/
│   ├── platform.ts          # MessagingPlatform interface + types
│   ├── create-platform.ts   # Async factory: config → adapter
│   ├── streamer.ts          # Platform-agnostic token streaming
│   ├── image-handler.ts     # Image processing pipeline (sanitize → OCR → store → describe)
│   ├── image-handler.test.ts
│   └── adapters/
│       ├── telegram.ts      # grammY bot + approval UI (inline buttons)
│       ├── whatsapp.ts      # WhatsApp Business API (Cloud API, webhook)
│       ├── signal.ts        # signal-cli JSON-RPC (text-based approvals)
│       ├── webchat.ts       # WebChat adapter (SSE streaming, REST API)
│       ├── webchat.test.ts
│       ├── slack.ts         # Slack adapter (@slack/bolt Socket Mode, Block Kit buttons)
│       ├── slack.test.ts
│       ├── discord.ts       # Discord adapter (discord.js Gateway Intents, Button components)
│       ├── discord.test.ts
│       └── companion.ts     # Companion app adapter (WebSocket bridge)
├── tools/
│   ├── tool-registry.ts     # Tool schema + handler registry (native + MCP)
│   ├── mcp-client.ts        # MCP server discovery + tool wrapping
│   ├── claude-code.ts       # Claude Code CLI driver
│   ├── shell.ts             # Shell command executor
│   ├── filesystem.ts        # File operations
│   ├── git.ts               # Git operations
│   ├── web-search.ts        # SearXNG + Brave Search providers
│   ├── web-fetch.ts         # URL fetch + HTML→Markdown converter
│   ├── memory.ts            # memory_read, memory_write, memory_search tools
│   ├── cron.ts              # Cron job management tool (create/list/delete)
│   ├── browser.ts           # Browser automation tool (9 CDP actions)
│   ├── skill.ts             # Skill management tool (list/install/enable/disable/generate)
│   ├── webhook.ts           # Webhook management tool (create/list/delete/test)
│   ├── process.ts           # Process management tool (spawn/list/check/kill/logs)
│   ├── tts.ts               # TTS tool (tts_speak via ElevenLabs)
│   ├── agents.ts            # Agent management tool (list/send/history)
│   ├── companion.ts         # Companion device tool (pair/unpair/list/push_token)
│   ├── smart-home.ts        # Smart home tool (discover/list/control/scene/automation)
│   ├── gmail.ts             # Gmail tool (auth/read/send/label/delete)
│   └── calendar.ts          # Calendar tool (auth/list/create/update/delete)
├── memory/
│   ├── store.ts             # MEMORY.md read/write/append + daily notes
│   ├── embeddings.ts        # Ollama embeddings + cosine similarity search
│   ├── recall.ts            # Auto-recall (semantic search + threshold)
│   ├── store.test.ts
│   └── embeddings.test.ts
├── automation/
│   ├── cron-parser.ts       # 5-field cron expression parser + next-run
│   ├── scheduler.ts         # Job scheduler (30s tick, retry backoff)
│   ├── cron-parser.test.ts
│   └── scheduler.test.ts
├── billing/
│   ├── pricing.ts           # Model pricing table + cost calculator
│   ├── usage-logger.ts      # Per-request usage logging + daily aggregates
│   ├── budget-monitor.ts    # Budget threshold alerts (50/75/90%)
│   ├── pricing.test.ts
│   ├── usage-logger.test.ts
│   └── budget-monitor.test.ts
├── browser/
│   ├── launcher.ts          # Chrome binary discovery, CDP launch/connect/close
│   ├── snapshot.ts          # Accessibility tree extraction + node search
│   ├── actions.ts           # Navigate, click, fill, screenshot, evaluate, waitForSelector
│   ├── launcher.test.ts
│   ├── snapshot.test.ts
│   └── actions.test.ts
├── skills/
│   ├── format.ts            # SKILL.md YAML frontmatter parser + serializer
│   ├── registry.ts          # Skill discovery, loading, enable/disable, generate
│   ├── injector.ts          # buildSkillContext() for system prompt injection
│   ├── marketplace.ts       # Marketplace fetch, search, install, templates
│   ├── verification.ts      # SHA-256 hash verification
│   ├── templates.ts         # 5 built-in skill templates
│   ├── format.test.ts
│   └── registry.test.ts
├── voice/
│   ├── transcriber.ts       # OpenAI Whisper API + local whisper.cpp
│   ├── converter.ts         # ffmpeg audio → WAV 16kHz mono conversion
│   ├── synthesizer.ts       # ElevenLabs TTS client + LRU cache
│   ├── synthesizer.test.ts
│   ├── transcriber.test.ts
│   └── converter.test.ts
├── sandbox/
│   ├── container.ts         # Docker container lifecycle (create/exec/destroy)
│   ├── session-pool.ts      # Per-session container pool management
│   ├── volume-mount.ts      # Safe volume mounting + path validation
│   ├── container.test.ts
│   ├── session-pool.test.ts
│   └── volume-mount.test.ts
├── models/
│   ├── provider.ts          # ModelProvider interface + types
│   ├── openrouter.ts        # OpenRouter provider (native fetch, SSE streaming)
│   ├── model-registry.ts    # Model registry with failover chains
│   ├── openrouter.test.ts
│   └── model-registry.test.ts
├── webhooks/
│   ├── router.ts            # Route registry + HMAC auth + rate limiting
│   ├── handler.ts           # Event templates (GitHub/Stripe/generic)
│   ├── server.ts            # HTTP webhook server
│   ├── router.test.ts
│   ├── handler.test.ts
│   └── server.test.ts
├── process/
│   ├── manager.ts           # Background process spawn/kill/logs
│   └── manager.test.ts
├── agents/
│   ├── agent-config.ts      # AgentConfig type + Zod schema, specialist templates
│   ├── hub.ts               # Hub-and-Spoke router (skill/intent/explicit routing)
│   ├── session-manager.ts   # Per-agent chat namespacing
│   ├── communication.ts     # Inter-agent message passing
│   ├── agent-config.test.ts
│   ├── hub.test.ts
│   ├── session-manager.test.ts
│   └── communication.test.ts
├── companion/
│   ├── ws-server.ts         # WebSocket server (ws package, pairing, heartbeat)
│   ├── pairing.ts           # 6-digit pairing codes (5min TTL)
│   ├── device-registry.ts   # In-memory device CRUD
│   ├── push.ts              # APNS (node:http2) + FCM (native fetch) push
│   ├── ws-server.test.ts
│   ├── pairing.test.ts
│   ├── device-registry.test.ts
│   └── push.test.ts
├── integrations/
│   ├── hue.ts               # Philips Hue API v2 client
│   ├── homeassistant.ts     # HomeAssistant REST API client
│   ├── sonos.ts             # Sonos HTTP API client
│   ├── discovery.ts         # SSDP + cloud discovery
│   ├── google/
│   │   ├── auth.ts          # Google OAuth2 flow + token management
│   │   ├── gmail.ts         # Gmail API client
│   │   ├── calendar.ts      # Google Calendar API client
│   │   ├── auth.test.ts
│   │   ├── gmail.test.ts
│   │   └── calendar.test.ts
│   ├── hue.test.ts
│   ├── homeassistant.test.ts
│   ├── sonos.test.ts
│   └── discovery.test.ts
├── dashboard/
│   └── public/
│       ├── index.html       # Single-page chat UI
│       ├── style.css        # Dark theme, responsive
│       └── app.js           # SSE client + markdown rendering
├── security/
│   ├── image-sanitizer.ts   # EXIF/XMP/IPTC stripping + injection scanning
│   └── image-sanitizer.test.ts
├── audit/
│   └── audit-log.ts         # Hash-chained JSONL
├── db/
│   ├── client.ts            # better-sqlite3 + Drizzle setup
│   └── schema.ts            # Drizzle table definitions
├── onboarding/
│   ├── check.ts             # Claude Code startup check + onboarding messages
│   ├── setup.ts             # CLI entry point (pnpm setup)
│   ├── wizard.ts            # Interactive setup wizard orchestrator
│   ├── steps/
│   │   ├── prerequisites.ts # Node/Ollama/Claude Code checks
│   │   ├── platform.ts      # Platform selection
│   │   ├── telegram.ts      # Bot token + auto-ID detection
│   │   ├── whatsapp.ts      # WhatsApp Business setup
│   │   ├── signal.ts        # Signal setup
│   │   ├── slack.ts         # Slack setup (bot token, app token, channel)
│   │   ├── discord.ts       # Discord setup (bot token, channel)
│   │   ├── claude-auth.ts   # Claude Code authentication
│   │   └── summary.ts       # Config review + .env generation
│   └── utils/
│       ├── ui.ts            # chalk/ora formatting
│       ├── prompt.ts        # German prompt wrappers (@inquirer/prompts)
│       ├── validate.ts      # Token/credential validators
│       ├── clipboard.ts     # clipboardy wrapper
│       └── ocr.ts           # tesseract.js OCR pipeline
├── i18n/
│   ├── index.ts             # t(), setLocale(), getLocale()
│   ├── keys.ts              # TranslationKey union type
│   ├── index.test.ts        # i18n tests
│   └── locales/
│       ├── de.ts            # German translations
│       └── en.ts            # English translations
└── config/
    ├── defaults.ts          # Default settings
    └── schema.ts            # Zod config validation
```

## Project Status
- [x] Project initialized
- [x] Research: local LLM options → **Qwen3 8B default** (configurable via `ORCHESTRATOR_MODEL`)
- [x] Research: OpenClaw architecture analysis
- [x] Research: system prompts knowledge base
- [x] Architecture design → `docs/ARCHITECTURE.md`
- [x] Orchestrator system prompt → `docs/ORCHESTRATOR_PROMPT.md`
- [x] Review: Architecture, prompt, tech stack, competition (4-agent review)
- [x] Project scaffolding (package.json, tsconfig, etc.)
- [x] Core: Vercel AI SDK + Ollama integration + agent loop
- [x] Core: Hybrid risk classifier + approval gate
- [x] Core: Telegram bot (grammY) + approval UI
- [x] Core: Tool executors (shell, filesystem, git)
- [x] Core: MCP client + tool wrapping
- [x] Integration: Claude Code subprocess driver
- [x] DB: Drizzle schema + migrations
- [x] Audit log
- [x] Unit tests (1137 tests — node:test runner)
- [x] Security: obfuscation-resistant L3 patterns (path variants, script network, base64, chmod +x)
- [x] Security: MCP output sanitization (DATA boundary tags, instruction filtering)
- [x] Security: MCP server allowlist (`mcp.allowedServers` config)
- [x] Security: XML-based LLM classifier output (more reliable with Qwen3 8B, JSON fallback)
- [x] Security: shlex-style command decomposition (prevents chained command bypass)
- [x] Fix: Claude Code output token limit retry + raised cap
- [x] Claude Code CLI driver rewrite (stream-json, sessions, tool scoping, streaming callbacks)
- [x] Config expansion (toolProfiles, sessionTtl, outputFormat, defaultDirs, mcpConfigPath)
- [x] Orchestrator prompt upgrade (4-way intent: QUESTION/SIMPLE_TASK/CODING_TASK/AMBIGUOUS)
- [x] Prompt generator upgrade (8 templates, buildClaudeCodePrompt, scopeToolsForRisk)
- [x] Claude Code streaming integration (live Telegram updates)
- [x] Session tracking + audit log extension
- [x] Multi-platform messaging (Telegram + WhatsApp + Signal)
- [x] Onboarding: ANTHROPIC_API_KEY support + Claude Code startup check
- [x] Interactive setup wizard (`pnpm setup`) — auto-detection, OCR, clipboard, validation
- [x] Windows compatibility (shell executor, Signal named pipes, OCR, detached processes)
- [x] Security: filesystem directory confinement (reject paths outside cwd)
- [x] Security: MCP response validation (Zod schema instead of unsafe type assertions)
- [x] Signal adapter graceful shutdown (reject pending JSON-RPC requests)
- [x] DB schema versioning (`schema_version` table for future migrations)
- [x] i18n: German + English with `t()` function, typed keys, `LOCALE` config
- [x] Security: image metadata sanitizer (EXIF/XMP/IPTC stripping, injection scanning, sharp)
- [x] E2E integration tests (32 tests — agent flow, audit, approval, streaming)
- [x] Ollama error handling (3 retries, user-friendly connection errors)
- [x] Human-readable startup config errors (Zod → env var mapping)
- [x] Docker support (Dockerfile, docker-compose.yml with Ollama + GPU)
- [x] Deployment guide (Docker, systemd, PM2)
- [x] npm CLI entry point (`geofrey` / `geofrey setup`)
- [x] CHANGELOG.md
- [x] ~~v1.0.0 release~~ (deleted due to bugs)
- [x] ~~v1.0.1 release~~ (deleted due to bugs)
- [x] Image upload support (Telegram/WhatsApp/Signal → sanitize → OCR → text description to orchestrator)
- [x] OpenClaw gap analysis → `docs/OPENCLAW_GAP_ANALYSIS.md`
- [x] Web-Dashboard + WebChat (SSE streaming, REST API, Bearer auth, dark theme UI)
- [x] Persistent Memory (MEMORY.md store, Ollama embeddings, cosine similarity search)
- [x] Web Search + Web Fetch (SearXNG + Brave Search, HTML→Markdown converter)
- [x] Cron/Scheduler (5-field cron parser, persistent jobs, exponential retry backoff)
- [x] Cost Tracking (per-request logging, daily aggregates, budget threshold alerts)
- [x] Browser Automation (Chrome DevTools Protocol, accessibility tree snapshots, CDP actions)
- [x] Skill System (SKILL.md YAML frontmatter, registry, permissions manifest, auto-generation)
- [x] Slack + Discord Adapters (@slack/bolt Socket Mode, discord.js Gateway Intents)
- [x] Voice Messages STT (OpenAI Whisper API + local whisper.cpp, ffmpeg audio conversion)
- [x] Session Compaction (token counting, auto-compaction at 75% context, pre-compaction memory flush)
- [x] Docker Sandbox per Session (container lifecycle, session pool, volume mounting, health checks)
- [x] Multi-Model Support via OpenRouter (provider interface, failover chains, task-specific routing)
- [x] Webhook Triggers (HTTP server, HMAC auth, rate limiting, GitHub/Stripe/generic templates)
- [x] Process Management Tool (spawn, kill, logs, SIGTERM→SIGKILL escalation)
- [x] TTS via ElevenLabs (speech synthesis, LRU cache, text splitting)
- [x] Multi-Agent Routing (Hub-and-Spoke, 3 routing strategies, per-agent session isolation)
- [x] Skill Marketplace (curated repository, SHA-256 hash verification, 5 built-in templates)
- [x] Companion Apps Backend (WebSocket server, 6-digit pairing, APNS/FCM push)
- [x] Smart Home Integration (Philips Hue API v2, HomeAssistant REST, Sonos HTTP, SSDP/mDNS discovery)
- [x] Gmail/Calendar Automation (Google OAuth2, Gmail API, Google Calendar API)

## Roadmap (OpenClaw Feature Parity + Beyond)

Full gap analysis: `docs/OPENCLAW_GAP_ANALYSIS.md`

### Phase 1 — Essentials (v1.1)
- [x] Web-Dashboard + WebChat (Desktop-Nutzung ohne Telegram)
- [x] Persistent Memory (MEMORY.md + semantic search — Langzeitgedächtnis)
- [x] Web Search + Web Fetch Tools (Internet-Fähigkeiten)
- [x] Cron/Scheduler (proaktive Aufgaben, persistent, at/every/cron)
- [x] Cost Tracking (per-request Token/Cost Logging, Budget-Limits)

### Phase 2 — Power Features (v1.2)
- [x] Browser-Automation (Chrome DevTools Protocol)
- [x] Skill-System (SKILL.md Format + Registry)
- [x] Slack + Discord Adapter
- [x] Voice Messages STT (Whisper — WhatsApp/Telegram Sprachnachrichten)
- [x] Session Compaction (intelligentes Context-Window-Management)

### Phase 3 — Differenzierung (v1.3)
- [x] Docker Sandbox per Session (isolierte Tool-Ausführung)
- [x] Multi-Model Support via OpenRouter (100+ Modelle)
- [x] Webhook-Triggers (externe Events als Auslöser)
- [x] Process Management Tool (Hintergrund-Prozesse)
- [x] TTS (ElevenLabs — Sprachantworten)

### Phase 4 — Ecosystem (v2.0)
- [x] Multi-Agent Routing (Hub-and-Spoke, per-Agent Config)
- [x] Skill-Marketplace (Community-Skills)
- [x] Companion Apps (macOS/iOS/Android)
- [x] Smart Home Integration (Hue, HomeAssistant, Sonos)
- [x] Gmail/Calendar Automation

### Geofrey-Vorteile vs. OpenClaw (beibehalten & ausbauen)
- 3-Layer Prompt Injection Defense (User/Tool/Model)
- Nativer MCP Client mit Security (Output Sanitization, Allowlist, Zod Validation)
- Image Metadata Sanitization (EXIF/XMP/IPTC + Injection Scanning)
- Lokaler Orchestrator als Sicherheitsschicht (80-90% günstiger)
- Hybrid Risk Classification (Deterministic 90% + LLM 10%)
- Filesystem Confinement (confine())
- Obfuscation-resistant L3 Blocking

## Conventions
- Code language: English
- Commit messages: English
- Strict TypeScript (strict: true)
- ESM modules
- Zod for runtime validation
- No classes where functions suffice
- Drizzle for all DB access (no raw SQL)

## Key Decisions Log
| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-02-11 | Project created | Better OpenClaw with local AI orchestrator |
| 2026-02-11 | Qwen3 8B as default orchestrator | 0.933 F1, 5GB Q4, ~40 tok/s — fits 18GB RAM comfortably |
| 2026-02-11 | Qwen3-Coder-Next as future code worker | 70.6% SWE-Bench, 80B/3B MoE, 52GB Q4 — local code worker for simple tasks (coming soon) |
| 2026-02-11 | Mandatory blocking approvals | OpenClaw's fire-and-forget approval is a critical flaw (still not truly fixed) |
| 2026-02-11 | TypeScript over Python | Async-native, better subprocess mgmt, same stack as OpenClaw/Claude Code |
| 2026-02-11 | grammY for Telegram | Best TS types, conversations plugin, active ecosystem |
| 2026-02-11 | 4-tier risk classification | Binary allow/deny too coarse; L0-L3 gives nuance without over-prompting |
| 2026-02-11 | Long Polling over Webhooks | Local-first, no public URL needed |
| 2026-02-11 | Hash-chained JSONL for audit | Tamper-evident, append-only, human-readable |
| 2026-02-11 | Vercel AI SDK 6 over OpenAI SDK | ToolLoopAgent + needsApproval built-in; native Ollama provider; eliminates custom agent loop code |
| 2026-02-11 | MCP Client for tool integration | 10K+ servers, industry standard (Linux Foundation), wrapped by risk classifier |
| 2026-02-11 | Drizzle ORM over raw better-sqlite3 | Type-safe queries, schema migrations, zero runtime overhead |
| 2026-02-11 | Hybrid risk classification | Deterministic patterns (90%) + LLM fallback (10%) — no single point of failure |
| 2026-02-11 | 3-layer prompt injection defense | User input, tool output, model response — each isolated as DATA |
| 2026-02-13 | Removed 14B tier — single tested default | 0.933 F1 sufficient; 90% deterministic regex; 14B untested with our prompts; marginal gain at 2x RAM |
| 2026-02-12 | XML over JSON for LLM classifier output | Qwen3 8B more reliable with XML tags; JSON fallback for backward compat |
| 2026-02-12 | Shlex-style command decomposition | Prevents `ls && curl evil` bypass — each segment classified individually |
| 2026-02-12 | Claude Code as primary coding agent | Local LLM as communication bridge + prompt optimizer + safety layer; Claude Code does actual coding |
| 2026-02-12 | stream-json as default output format | Enables live Telegram updates during Claude Code tasks |
| 2026-02-12 | Risk-scoped tool profiles | L0→readOnly, L1→standard, L2→full — principle of least privilege for Claude Code |
| 2026-02-12 | Multi-platform messaging abstraction | MessagingPlatform interface enables Telegram, WhatsApp, Signal with same orchestrator |
| 2026-02-12 | WhatsApp Business Cloud API | Official API, interactive buttons (max 3), native fetch — no heavy dependency |
| 2026-02-12 | Signal via signal-cli JSON-RPC | No inline buttons → text-based approvals ("1 = Genehmigen, 2 = Ablehnen") |
| 2026-02-12 | ANTHROPIC_API_KEY support | Alternative to subscription — passed via env to Claude Code subprocess |
| 2026-02-12 | Onboarding startup check | Checks CLI availability + auth status, shows actionable instructions |
| 2026-02-12 | Interactive setup wizard | `pnpm setup` — auto-detection, OCR, clipboard, real-time validation; better UX than OpenClaw |
| 2026-02-12 | @inquirer/prompts + chalk + ora | Modern ESM CLI toolkit — tree-shakeable, German prompts |
| 2026-02-12 | tesseract.js for OCR | Pure WASM, lazy-loaded (~60MB first use) — extract tokens from screenshots |
| 2026-02-12 | Windows compatibility | shell.ts: cmd /c, Signal: named pipes, OCR: PowerShell SnippingTool, prerequisites: cmd start /b |
| 2026-02-12 | Filesystem directory confinement | `confine()` rejects paths outside `process.cwd()` — prevents path traversal |
| 2026-02-12 | MCP Zod response validation | `mcpContentSchema.safeParse()` replaces unsafe `as` assertions on MCP tool output |
| 2026-02-12 | Schema version tracking | `schema_version` table with version + applied_at — foundation for future DB migrations |
| 2026-02-12 | i18n with typed key-value maps | No external library; `t()` function + `satisfies` compile-time completeness; `de` + `en` locales |
| 2026-02-12 | Language selection in setup wizard | First wizard step is bilingual "Language / Sprache:", stored as `LOCALE` in `.env` |
| 2026-02-12 | Image metadata sanitization | EXIF/XMP/IPTC can carry prompt injection — strip before LLM, scan for patterns, audit findings |
| 2026-02-12 | sharp for image processing | Prebuilt binaries, EXIF orientation, metadata stripping in one pipeline; configurable via env vars |
| 2026-02-13 | OpenClaw gap analysis + roadmap | 4-phase roadmap (v1.1→v2.0) based on comprehensive OpenClaw feature comparison |
| 2026-02-13 | Hub-and-Spoke multi-agent routing | 3 strategies (skill/intent/explicit); per-agent session isolation; persistent agent configs |
| 2026-02-13 | Skill marketplace with SHA-256 verification | Curated repository, hash-verified downloads, 5 built-in templates |
| 2026-02-13 | Companion apps via WebSocket + push | ws package, 6-digit pairing (5min TTL), APNS (node:http2) + FCM (native fetch) |
| 2026-02-13 | Smart home integration (Hue/HA/Sonos) | Hue API v2, HomeAssistant REST, Sonos HTTP; SSDP discovery via node:dgram |
| 2026-02-13 | Gmail/Calendar via Google OAuth2 | OAuth2 with node:http callback, Gmail API + Calendar API (native fetch) |
