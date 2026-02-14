# geofrey.ai

**Privacy-first AI agent — your data stays on your machine.**

geofrey.ai is an open-source personal AI agent with a local LLM orchestrator that controls what data leaves your computer. Nothing goes to cloud APIs unreviewed, unanonymized, or without your explicit approval.

## What is this?

geofrey.ai runs a local LLM (Qwen3 8B via Ollama) as an intelligent orchestrator that sits between you and cloud AI services like Claude Code. It does three things:

1. **Privacy**: Detects personal data (names, emails, credentials, faces in photos) and anonymizes or blocks it before forwarding to cloud APIs. Credentials and biometric data never leave your machine.
2. **Safety**: Classifies every action by risk level (L0-L3). High-risk actions block until you tap "Approve" via Telegram, WhatsApp, or Signal. No code path around it.
3. **Efficiency**: Handles frequent work (intent classification, risk assessment, summarization, user communication) locally. Only delegates complex coding tasks to Claude Code CLI.

## Features

- **Privacy layer** — aggressive opt-out anonymization (regex 90% + LLM 10%), reversible placeholders, streaming de-anonymization, user-learns scope (global/project)
- **Image privacy** — Qwen3-VL-2B classifies images locally (on-demand load/process/unload), face photos never leave your machine, screenshots → OCR only
- **4-tier risk classification (L0-L3)** — auto-approve reads, notify on safe writes, require approval for dangerous actions, block destructive commands
- **Hybrid classifier** — deterministic patterns handle 90% of cases instantly, LLM fallback for ambiguous commands
- **Structural approval blocking** — Promise-based gate with no code path around it
- **Multi-platform messaging** — Telegram (inline buttons), WhatsApp (interactive buttons), Signal (text-based)
- **Claude Code integration** — local LLM routes coding tasks to Claude Code CLI with risk-scoped tool profiles
- **20 native local-ops tools** — mkdir, copy, move, find, tree, diff, sort, head/tail, base64, archive, system info — all handled locally (0 cloud tokens, instant execution)
- **Per-request cost display** — every response shows cloud vs. local token usage with cost in EUR/USD
- **MCP ecosystem access** — 10K+ community tool servers wrapped by risk classifier
- **Hash-chained audit log** — tamper-evident JSONL with SHA-256 chain, tracks cost/tokens/model/session
- **Prompt injection defense** — 3-layer isolation (user input, tool output, model response) + image metadata sanitization
- **Image upload support** — receive images on all platforms, sanitize, OCR text extraction, forward description to orchestrator
- **Image metadata sanitizer** — strips EXIF/XMP/IPTC/PNG text chunks, applies orientation, scans for prompt injection in metadata
- **Command decomposition** — shlex-style split prevents `ls && curl evil` bypass
- **i18n** — German + English with typed translation keys
- **Windows + macOS + Linux** — cross-platform compatibility
- **Interactive setup wizard** — `pnpm setup` with auto-detection, OCR, clipboard support
- **Web dashboard + WebChat** — browser-based chat UI with SSE streaming, REST API, Bearer auth, dark theme
- **Persistent memory** — MEMORY.md flat files + Ollama embeddings for semantic search (cosine similarity)
- **Web search + fetch** — SearXNG (self-hosted) or Brave Search API, HTML→Markdown URL fetching
- **Cron/Scheduler** — persistent job scheduler with 5-field cron expressions, exponential retry backoff
- **Cost tracking** — per-request token/cost logging, daily aggregates, budget threshold alerts (50/75/90%)
- **Browser automation** — Chrome DevTools Protocol integration with accessibility tree snapshots, navigate/click/fill/screenshot/evaluate
- **Skill system** — SKILL.md YAML frontmatter format, global + local directories, permissions manifest, auto-generation
- **Slack + Discord** — @slack/bolt (Socket Mode, Block Kit buttons) + discord.js (Gateway Intents, Button components)
- **Voice messages / STT** — OpenAI Whisper API + local whisper.cpp, ffmpeg audio conversion, all platforms
- **Session compaction** — auto-compaction at 75% context usage, Ollama summarization, pre-compaction memory flush
- **Graceful shutdown** — cleans up child processes, browsers, flushes audit log, rejects pending approvals

## Quick Start

### Prerequisites

- **Node.js 22+** ([download](https://nodejs.org/))
- **Ollama** ([install](https://ollama.com/download))
- **pnpm** (`npm install -g pnpm`)
- **Claude Code CLI** (optional, for coding tasks) — [install](https://github.com/anthropics/claude-code)

### Installation

```bash
# Clone repository
git clone https://github.com/slavko-at-klincov-it/geofrey.ai.git
cd geofrey.ai

# Install dependencies
pnpm install

# Pull Ollama model (default: Qwen3 8B, ~5GB download)
ollama pull qwen3:8b

# Run interactive setup wizard (auto-detects prerequisites, credentials, platform)
pnpm setup
```

The setup wizard will guide you through:
1. Language selection (German / English)
2. Prerequisites check (Node, Ollama, Claude Code)
3. Platform selection (Telegram / WhatsApp / Signal / Slack / Discord)
4. Credential configuration (bot tokens, phone numbers, API keys)
5. Claude Code authentication (subscription or API key)
6. Review and .env generation

### Start

```bash
# Development mode (auto-reload on file changes)
pnpm dev

# Production build + run
pnpm build
pnpm start
```

Send a message to your bot on Telegram/WhatsApp/Signal to start interacting.

### Docker

```bash
cp .env.example .env
# Edit .env with your config (set OLLAMA_BASE_URL=http://ollama:11434)
docker compose up -d
docker compose exec ollama ollama pull qwen3:8b
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for systemd, PM2, and production deployment options.

## Manual Configuration

If you prefer manual setup, copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Key Environment Variables

```env
# Locale (de | en)
LOCALE=de

# Platform (telegram | whatsapp | signal | webchat | slack | discord)
PLATFORM=telegram

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_OWNER_ID=your_telegram_user_id

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
ORCHESTRATOR_MODEL=qwen3:8b

# Claude Code (optional, for coding tasks)
# Requires Claude Pro/Max subscription OR ANTHROPIC_API_KEY
# ANTHROPIC_API_KEY=sk-ant-...

# Limits
MAX_AGENT_STEPS=15
APPROVAL_TIMEOUT_MS=300000
MAX_CONSECUTIVE_ERRORS=3

# Web Dashboard (optional)
# DASHBOARD_ENABLED=true
# DASHBOARD_PORT=3001
# DASHBOARD_TOKEN=your_secret_token

# Web Search (optional — SearXNG default, Brave alternative)
# SEARCH_PROVIDER=searxng
# SEARXNG_URL=http://localhost:8080
# BRAVE_API_KEY=your_brave_api_key

# Cost Tracking (optional)
# MAX_DAILY_BUDGET_USD=10.00
```

See `.env.example` for all available options including WhatsApp, Signal, MCP servers, and Claude Code advanced settings.

## Architecture

```
User (Telegram/WhatsApp/Signal) → Local Orchestrator (Qwen3 8B) → Risk Classifier (L0-L3)
                        ↕                                ↓
                  Approval Gate ◄── L2: Promise blocks until user approves
                        ↓
                  Tool Executors (20 local-ops, Claude Code, shell, filesystem, git, MCP)
                        ↓
                  Audit Log (hash-chained JSONL) + Cost Display [Cloud: X | Lokal: Y]
```

### Core Components

- **Local Orchestrator** — Qwen3 8B via Ollama classifies intent, manages conversation, optimizes prompts
- **Risk Classifier** — Hybrid deterministic (regex) + LLM for ambiguous cases
- **Approval Gate** — Promise-based blocking mechanism, no code path to execute without user approval
- **20 Local-Ops Tools** — File, directory, text, system, and archive operations executed locally (0 cloud tokens)
- **Per-Request Cost Display** — Every response shows `[Cloud: X Tokens (€Y) | Lokal: Z Tokens (€0,00)]`
- **Claude Code Driver** — Subprocess manager with streaming, session tracking, tool scoping
- **Messaging Adapters** — Platform-specific implementations (grammY for Telegram, Cloud API for WhatsApp, signal-cli for Signal, SSE for WebChat, @slack/bolt for Slack, discord.js for Discord)
- **Audit Log** — Append-only JSONL with SHA-256 hash chain for tamper detection

See `docs/ARCHITECTURE.md` for full technical details.

## Risk Levels

Every action is classified into four tiers: **L0** (auto-approve reads), **L1** (execute + notify), **L2** (block until user approves), **L3** (refuse always). Unknown commands default to L2 (fail-safe). Sensitive paths escalate +1 level. Chained commands (`&&`, `||`, `;`) are decomposed and each segment classified individually.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#risk-classification-4-tier-hybrid) for the full classification table, escalation rules, and examples.

## Supported Platforms

### Telegram

- **Interface**: Inline keyboard buttons
- **Features**: Message editing for streaming updates, approval UI with 4 buttons (Approve, Deny, Info, Deny+Why)
- **Setup**: BotFather token + owner Telegram user ID (auto-detected in wizard)

### WhatsApp

- **Interface**: Interactive buttons (max 3 per message)
- **Features**: Webhook-based, official Cloud API, HMAC-SHA256 signature validation
- **Setup**: Business phone number ID, permanent access token, webhook verification token
- **Note**: Enable "Advanced Chat Privacy" in WhatsApp settings for the bot chat (client-side setting)

### Signal

- **Interface**: Text-based approvals ("1 = Approve, 2 = Deny")
- **Features**: signal-cli JSON-RPC, no inline buttons
- **Setup**: signal-cli installed, bot phone number registered, owner phone number

### WebChat (Web Dashboard)

- **Interface**: Browser-based chat UI with approval buttons
- **Features**: SSE real-time streaming, dark theme, mobile-responsive, audit log viewer
- **Setup**: Set `PLATFORM=webchat` + `DASHBOARD_ENABLED=true`, optional `DASHBOARD_TOKEN` for auth
- **Port**: Default 3001 (configurable via `DASHBOARD_PORT`)

### Slack

- **Interface**: Block Kit buttons for approvals
- **Features**: Socket Mode (no public webhook), mrkdwn formatting, channel-scoped
- **Setup**: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`

### Discord

- **Interface**: Button components for approvals
- **Features**: Gateway Intents, message editing for streaming updates
- **Setup**: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`

## Development

```bash
# Run in development mode with auto-reload
pnpm dev

# Run tests (node:test runner, 1199 tests across 140+ suites)
pnpm test

# Type check
pnpm lint

# Build for production
pnpm build

# Database migrations
pnpm db:generate  # Generate migration from schema changes
pnpm db:migrate   # Apply migrations
```

### Project Structure

```
src/
├── index.ts                 # Entry point + graceful shutdown
├── orchestrator/            # Qwen3 agent loop, conversation, prompt generator, compaction
├── approval/                # Risk classifier, approval gate
├── messaging/               # Platform adapters, image handler (Telegram, WhatsApp, Signal, WebChat, Slack, Discord)
├── tools/                   # Tool executors (Claude Code, shell, filesystem, git, MCP, web, memory, cron, browser, skill)
├── local-ops/               # 20 native local-ops tools (file, dir, text, system, archive) — 0 cloud tokens
├── security/                # Image metadata sanitizer, injection scanning
├── audit/                   # Hash-chained JSONL audit log
├── memory/                  # Persistent memory (MEMORY.md, embeddings, recall)
├── automation/              # Cron parser + job scheduler
├── billing/                 # Cost tracking, pricing, budget alerts, per-request cost display
├── browser/                 # Chrome DevTools Protocol (launcher, snapshot, actions)
├── skills/                  # SKILL.md format, registry, injector
├── voice/                   # STT transcriber (Whisper) + ffmpeg audio converter
├── dashboard/               # Web dashboard static files (HTML + CSS + JS)
├── db/                      # SQLite + Drizzle ORM
├── i18n/                    # German + English translations
├── onboarding/              # Interactive setup wizard
└── config/                  # Zod config validation
```

## Security

geofrey.ai implements defense-in-depth across multiple layers:

- **4-tier risk classification** — deterministic regex (90%, <1ms) + LLM fallback (10%), shlex-style command decomposition prevents chained command bypass
- **Structural approval gate** — Promise-based blocking with no bypass mode, no code path from "pending" to "execute" without user approval
- **3-layer prompt injection defense** — user input, tool output, and model response isolated as DATA
- **Filesystem confinement** — `confine()` rejects all paths outside project directory, prevents path traversal and symlink attacks
- **Image metadata sanitization** — EXIF/XMP/IPTC stripping + injection pattern scanning before LLM processing
- **Hash-chained audit log** — SHA-256 chain, tamper-evident, with cost/token tracking per request

See [docs/WHITEPAPER.md](docs/WHITEPAPER.md) for the full security analysis, OWASP Agentic AI Top 10 coverage, and credential isolation details.

## Contributing

Contributions welcome. Please:

1. Open an issue to discuss significant changes before submitting a PR
2. Follow existing code style (TypeScript strict mode, ESM, functional over class-based)
3. Add tests for new features (`src/**/*.test.ts`)
4. Update `CLAUDE.md` if adding new architectural components
5. Use English for code/comments/commits, German for user-facing messages (with i18n)

See `CLAUDE.md` for project conventions and key decisions log.

---

**Hardware Requirements**

- **RAM:** 18GB+ (M-series Mac or equivalent) — Qwen3 8B needs ~5GB Q4, leaving comfortable headroom
- **Orchestrator:** Qwen3 8B via Ollama (default, tested) — configurable via `ORCHESTRATOR_MODEL` env var

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#hardware-requirements) for detailed hardware requirements and the Qwen3-Coder-Next roadmap.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLATFORM` | No | `telegram` | Messaging platform: `telegram`, `whatsapp`, `signal`, `webchat`, `slack`, or `discord` |
| `TELEGRAM_BOT_TOKEN` | Telegram | — | Bot token from @BotFather |
| `TELEGRAM_OWNER_ID` | Telegram | — | Your Telegram user ID |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | — | Business phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | — | Permanent access token |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp | — | Webhook verification token |
| `WHATSAPP_OWNER_PHONE` | WhatsApp | — | Owner phone number (e.g. `491234567890`) |
| `WHATSAPP_WEBHOOK_PORT` | No | `3000` | Webhook server port |
| `SIGNAL_CLI_SOCKET` | No | `/var/run/signal-cli/socket` | signal-cli JSON-RPC socket path |
| `SIGNAL_OWNER_PHONE` | Signal | — | Owner phone (e.g. `+491234567890`) |
| `SIGNAL_BOT_PHONE` | Signal | — | Bot's Signal number |
| `ORCHESTRATOR_MODEL` | No | `qwen3:8b` | Ollama model name |
| `ORCHESTRATOR_NUM_CTX` | No | `16384` | Context window size (increase to 32768 on 32GB+ systems) |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama API URL |
| `DATABASE_URL` | No | `./data/app.db` | SQLite database path |
| `AUDIT_LOG_DIR` | No | `./data/audit` | Audit log directory |
| `MCP_SERVERS` | No | — | JSON array of MCP server configs |
| `MCP_ALLOWED_SERVERS` | No | — | Comma-separated allowlist of MCP server names |
| `IMAGE_SANITIZER_ENABLED` | No | `true` | Enable/disable image metadata stripping |
| `IMAGE_SANITIZER_MAX_SIZE` | No | `20971520` | Max input image size in bytes (20MB) |
| `IMAGE_SANITIZER_SCAN_INJECTION` | No | `true` | Scan metadata for prompt injection patterns |
| `DASHBOARD_ENABLED` | No | `false` | Enable web dashboard + WebChat adapter |
| `DASHBOARD_PORT` | No | `3001` | Dashboard HTTP server port |
| `DASHBOARD_TOKEN` | No | — | Bearer token for dashboard auth (recommended) |
| `SEARCH_PROVIDER` | No | `searxng` | Web search provider: `searxng` or `brave` |
| `SEARXNG_URL` | No | `http://localhost:8080` | SearXNG instance URL |
| `BRAVE_API_KEY` | Brave | — | Brave Search API key (required if provider is `brave`) |
| `MAX_DAILY_BUDGET_USD` | No | — | Daily spend cap in USD (alerts at 50/75/90%) |
| `SLACK_BOT_TOKEN` | Slack | — | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack | — | Slack app-level token (`xapp-...`) for Socket Mode |
| `SLACK_CHANNEL_ID` | Slack | — | Slack channel ID to operate in |
| `DISCORD_BOT_TOKEN` | Discord | — | Discord bot token |
| `DISCORD_CHANNEL_ID` | Discord | — | Discord text channel ID |
| `STT_PROVIDER` | No | `openai` | Speech-to-text provider: `openai` or `local` |
| `OPENAI_API_KEY` | STT (openai) | — | OpenAI API key for Whisper STT |
| `WHISPER_MODEL_PATH` | STT (local) | — | Path to whisper.cpp model file (e.g. `ggml-base.bin`) |

#### Claude Code CLI

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed. Two authentication methods:

| Method | Setup | Cost |
|--------|-------|------|
| **Subscription** (recommended) | `claude login` — Pro/Max/Teams/Enterprise | Included in subscription |
| **API Key** | `ANTHROPIC_API_KEY=sk-ant-...` in `.env` | Pay-per-use |

geofrey.ai checks authentication on startup and shows actionable instructions if setup is incomplete.

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | API key (alternative to subscription login) |
| `CLAUDE_CODE_ENABLED` | `true` | Enable/disable Claude Code integration |
| `CLAUDE_CODE_SKIP_PERMISSIONS` | `true` | Use `--dangerously-skip-permissions` (required for non-interactive) |
| `CLAUDE_CODE_MODEL` | `claude-sonnet-4-5-20250929` | Model for coding tasks |
| `CLAUDE_CODE_TIMEOUT_MS` | `600000` | Timeout per invocation (10 min) |
| `CLAUDE_CODE_MAX_BUDGET_USD` | — | Optional spend cap per invocation |
| `CLAUDE_CODE_DEFAULT_DIRS` | — | Comma-separated additional working directories |
| `CLAUDE_CODE_OUTPUT_FORMAT` | `stream-json` | Output format (`json`, `stream-json`, `text`) |
| `CLAUDE_CODE_SESSION_TTL_MS` | `3600000` | Session TTL (1 hour, auto-expires inactive sessions) |
| `CLAUDE_CODE_MCP_CONFIG` | — | Path to MCP config for Claude Code |

**Tool profiles** are automatically scoped by risk level:

| Risk Level | Tools Available |
|------------|----------------|
| L0 (read-only) | Read, Glob, Grep |
| L1 (standard) | Read, Glob, Grep, Edit, Write, Bash(git:*) |
| L2 (full) | Read, Glob, Grep, Edit, Write, Bash |

---

## MCP Servers

Connect any MCP-compatible tool server:

```bash
# Via environment variable
MCP_SERVERS='[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/home/user"]}]' pnpm dev
```

All MCP tool calls are automatically routed through the risk classifier. The MCP ecosystem provides 10,000+ tool servers — geofrey.ai wraps them all with L0-L3 safety guarantees.

---

## Project Status

**1199 tests passing** across 140+ suites. 40+ native tools, 6 messaging platforms, 20 local-ops tools. See [CLAUDE.md](CLAUDE.md) for the full project status checklist and roadmap.

---

## Appendix: Comparison with OpenClaw

geofrey.ai addresses the core weaknesses of OpenClaw (formerly Clawdbot/Moltbot) — the most popular open-source AI agent platform:

| Area | OpenClaw Problem | geofrey.ai Solution |
|------|-----------------|---------------------|
| **Cost** | $200-600/month cloud API | $0 local orchestrator + 20 local-ops + selective API |
| **Security** | 42K exposed instances, 2 CVEs | No web UI, no public ports |
| **Approvals** | Fire-and-forget (Issue #2402) | Promise-based structural blocking |
| **Classification** | Single LLM call | Hybrid: deterministic (90%) + LLM (10%) |
| **Marketplace** | 7.1% leak credentials | MCP with allowlist + output sanitization |
| **Audit** | Plain-text logs | SHA-256 hash-chained, tamper-evident |
| **Privacy** | No anonymization | Regex + LLM anonymizer, image classifier, output filter |
| **Onboarding** | Simple 4-step wizard | Interactive wizard with auto-detection, OCR, validation |

See [docs/OPENCLAW_GAP_ANALYSIS.md](docs/OPENCLAW_GAP_ANALYSIS.md) for the detailed feature-by-feature comparison.

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — Full system design, dataflow, risk levels
- [Deployment](docs/DEPLOYMENT.md) — Docker, systemd, PM2, production tips
- [Orchestrator Prompts](docs/ORCHESTRATOR_PROMPT.md) — 4 focused prompts for Qwen3
- [Whitepaper](docs/WHITEPAPER.md) — Security analysis, cost comparison, market opportunity
- [Changelog](CHANGELOG.md) — Version history

---

## License

MIT License — see [LICENSE](LICENSE) file for details.

Copyright (c) 2026 geofrey.ai contributors
