# geofrey.ai

## Overview
An open-source, privacy-first AI agent that runs on your machine. A local LLM orchestrator controls what data leaves your computer — nothing goes to cloud APIs unreviewed, unanonymized, or without your explicit approval.

geofrey.ai is NOT a second OpenClaw. It is a fundamentally different architecture: the local LLM is a **privacy and safety layer** between you and cloud services, not just a cheaper way to call APIs.

## Core Concept
1. **Privacy Layer** — personal data (names, emails, images, credentials) is detected, anonymized, or blocked before it ever reaches Claude Code or any cloud API. See `docs/PRIVACY_LAYER.md`.
2. **Local LLM Orchestrator** (Qwen3 8B via Ollama) — classifies intent, assesses risk, anonymizes data, communicates with the user. All locally, no cloud dependency.
3. **User Confirmation via Messaging** — risky actions require explicit approval via Telegram/WhatsApp/Signal. Promise-based blocking — no code path around it.
4. **Hybrid Risk Classification** — deterministic patterns (90%) + LLM fallback (10%) for all tools (native + MCP).
5. **Local Vision Model** (Qwen3-VL-2B via Ollama) — classifies images on-demand (load → process → unload). Face photos never leave your machine.

## What We Don't Want
- **Cloud LLM Routers (OpenRouter, etc.)** — violates local-first philosophy. Was implemented and removed. All LLM inference stays local via Ollama.
- **TTS via Cloud APIs (ElevenLabs, etc.)** — paid cloud dependency. If TTS is needed, it must be local (e.g. Piper, Coqui).
- **Blind data forwarding** — no images, emails, or personal data sent to Claude Code without anonymization. This is the core difference to OpenClaw.
- **"Just works" at the cost of privacy** — we ask before forwarding, we anonymize by default, we remember the user's decisions.
- **Mock-only testing** — unit tests with mocks are fine as a first step for fast feedback, but a feature is NOT done until it has a passing E2E test with real infrastructure (Ollama, SQLite, real files). 1248 green unit tests hid 6 critical bugs. Never claim "all green" based on mocked tests alone.

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Language | **TypeScript** (Node.js ≥22) |
| Orchestrator LLM | **Qwen3 8B** via Ollama (default, configurable via `ORCHESTRATOR_MODEL`) |
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

## Project Structure
```
src/
├── index.ts                 # Entry point + graceful shutdown
├── orchestrator/
│   ├── agent-loop.ts        # Vercel AI SDK ToolLoopAgent wrapper
│   ├── conversation.ts      # Multi-turn conversation manager
│   ├── prompt-generator.ts  # Task templates for downstream models
│   └── compaction/          # Token counting, summarization, pruning
├── approval/
│   ├── risk-classifier.ts   # Hybrid: deterministic patterns + LLM fallback
│   └── approval-gate.ts     # Promise-based blocking gate (nonce IDs)
├── messaging/
│   ├── platform.ts          # MessagingPlatform interface + types
│   ├── create-platform.ts   # Async factory: config → adapter
│   ├── streamer.ts          # Platform-agnostic token streaming
│   ├── image-handler.ts     # Image processing pipeline
│   └── adapters/            # telegram, whatsapp, signal, webchat, slack, discord
├── tools/
│   ├── tool-registry.ts     # Tool schema + handler registry (native + MCP)
│   ├── mcp-client.ts        # MCP server discovery + tool wrapping
│   ├── claude-code.ts       # Claude Code CLI driver
│   ├── shell.ts             # Shell command executor
│   ├── filesystem.ts        # File operations
│   ├── git.ts               # Git operations
│   ├── web-search.ts        # SearXNG + Brave Search providers
│   ├── web-fetch.ts         # URL fetch + HTML→Markdown converter
│   ├── memory.ts            # memory_read, memory_write, memory_search
│   ├── cron.ts              # Cron job management
│   ├── browser.ts           # Browser automation (9 CDP actions)
│   ├── skill.ts             # Skill management
│   ├── webhook.ts           # Webhook management
│   ├── process.ts           # Process management
│   ├── agents.ts            # Agent management
│   ├── search.ts            # Recursive content search
│   ├── project-map.ts       # Project structure queries
│   ├── tts.ts               # TTS tool
│   ├── companion.ts         # Companion device pairing + push
│   ├── smart-home.ts        # Smart home control
│   ├── gmail.ts             # Gmail tool
│   ├── calendar.ts          # Calendar tool
│   ├── privacy.ts           # Privacy rules tool
│   └── auto-tooling.ts      # Auto-tooling (gap detect/build/validate/register)
├── local-ops/               # 20 native local tools (file, dir, text, system, archive ops)
├── auto-tooling/            # Gap detection, context collection, Docker launcher, validation
├── memory/                  # MEMORY.md store, embeddings, recall, structured entries, guard
├── automation/              # Cron parser, scheduler (30s tick, retry backoff)
├── billing/                 # Pricing, usage logging, budget alerts, cost formatting
├── browser/                 # Chrome CDP launcher, accessibility snapshots, actions
├── skills/                  # SKILL.md parser, registry, injector, marketplace, templates
├── voice/                   # Whisper STT, ffmpeg converter, TTS synthesizer
├── sandbox/                 # Docker container lifecycle, session pool, volume mounts
├── webhooks/                # Route registry, HMAC auth, HTTP server
├── process/                 # Background process spawn/kill/logs
├── agents/                  # Agent config, Hub-and-Spoke router, session manager
├── companion/               # Device registry, 6-digit pairing, APNS/FCM push, WebSocket
├── integrations/            # Hue, HomeAssistant, Sonos, SSDP discovery, Google OAuth/Gmail/Calendar
├── privacy/                 # Rules store, PII extraction, image classifier, email/output filters
├── profile/                 # Zod schema, JSON persistence, system prompt injection
├── proactive/               # Data collector, prompt templates, dedup, handler, setup
├── indexer/                 # CLI entry, incremental project indexer, TS parser
├── e2e/                     # End-to-end integration tests
├── dashboard/public/        # Chat UI (HTML/CSS/JS, dark theme, SSE)
├── security/                # Image sanitizer (EXIF/XMP/IPTC stripping)
├── audit/                   # Hash-chained JSONL audit log
├── db/                      # better-sqlite3 + Drizzle setup + schema
├── onboarding/              # Setup wizard, platform steps, validation utils
├── i18n/                    # t(), setLocale(), typed keys, de + en locales
└── config/                  # Defaults + Zod config validation
```

## Roadmap

### Deferred
- [ ] Benchmark: Risk Classifier LLM path — `pnpm benchmark:classifier qwen3:8b`

## Testing Policy

**Two-step process:** Unit test first (fast feedback), then mandatory E2E test (proof it works). See `docs/E2E_FINDINGS.md` for why.

### Test Hierarchy
1. **E2E Tests** (`src/e2e/live/`) — Full pipeline with real Ollama, real SQLite, real files. Run via `pnpm test:e2e`
2. **Integration Tests** (`*.test.ts`) — Multi-component flows, real DB, mock only external network services
3. **Unit Tests** (`*.test.ts`) — Pure functions, fast feedback

### Key Rules
| Rule | Why |
|------|-----|
| Test data = realistic data | German names, real email formats, actual message structures |
| Create real files and DB records | `mkdtemp()` + real SQLite + cleanup in `after()` |
| Skip gracefully, never fake success | If Ollama unavailable → `t.skip()`, never mock the LLM |
| No mock of Ollama for happy path | Real Ollama or skip |
| No mock of SQLite/Drizzle | Always use real temp database |
| No mock of internal modules | Never mock `anonymize()`, `classifyRisk()`, `searchMemory()` |

### Acceptable Mocks
Telegram/WhatsApp/Signal API, external HTTP APIs (Google, GitHub), Time/Date, filesystem errors

### Fixtures
All E2E test data in `src/e2e/live/helpers/fixtures.ts` (profiles, emails, shell commands, PII texts, gap requests)

```bash
pnpm test        # Unit/integration tests
pnpm test:e2e    # E2E tests (needs Ollama)
```

## Conventions
- Code language: English
- Commit messages: English
- Strict TypeScript (strict: true)
- ESM modules
- Zod for runtime validation
- No classes where functions suffice
- Drizzle for all DB access (no raw SQL)

## Reference Docs
| Doc | Content |
|-----|---------|
| `docs/ARCHITECTURE.md` | Full architecture with diagrams |
| `docs/ORCHESTRATOR_PROMPT.md` | System prompts for Qwen3 orchestrator |
| `docs/PRIVACY_LAYER.md` | Privacy layer design |
| `docs/DECISIONS.md` | Key decisions log (55+ entries with reasoning) |
| `docs/E2E_FINDINGS.md` | E2E test findings — 6 critical bugs unit tests missed |
| `docs/DEPLOYMENT.md` | Docker, systemd, PM2 deployment guide |
| `docs/WHITEPAPER.md` | Project whitepaper |
