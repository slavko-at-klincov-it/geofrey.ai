# geofrey.ai

**Local-first AI agent with structural safety guarantees.**

A personal AI assistant that runs a local LLM (Qwen3 8B) as a security orchestrator and communication bridge — classifying risk, optimizing prompts, blocking dangerous actions, and requiring explicit approval via Telegram before executing anything irreversible. Uses Claude Code CLI as the powerful coding backend. No cloud API loops, no exposed web interfaces, no bypasses.

---

## Why?

Cloud-based AI agent platforms like OpenClaw have three systemic problems:

| Problem | Impact |
|---------|--------|
| **Runaway costs** | $200-600+/month in API calls, system prompt resent every turn |
| **Critical vulnerabilities** | CVE-2026-25253 (RCE), 42,000+ exposed instances, malicious marketplace skills |
| **Broken safety** | Fire-and-forget approvals ([#2402](https://github.com/openclaw/openclaw/issues/2402)), `elevated: "full"` bypasses all checks |

geofrey.ai fixes all three. See the [Whitepaper](docs/WHITEPAPER.md) for detailed analysis.

---

## How It Works

```
User (Telegram) → Local Orchestrator (Qwen3 8B) → Risk Classifier (L0-L3)
                        ↕                                ↓
                  Approval Gate ◄── L2: blocks until user taps Approve
                        ↓
                  +-----------+-----------+-----------+
                  | Claude    | Shell     | MCP       |
                  | Code CLI  | Commands  | Client    |
                  | (stream)  |           | (wrapped) |
                  +-----------+-----------+-----------+
                        ↓
                  Audit Log (SHA-256 hash-chained)
```

### Risk Levels

| Level | Action | Examples |
|-------|--------|----------|
| **L0** Auto | Execute immediately | read_file, git status, ls |
| **L1** Notify | Execute + inform | write_file, git add, npm test |
| **L2** Approve | **Block until user approves** | delete_file, git commit, shell_exec |
| **L3** Block | Refuse always | rm -rf, sudo, curl\|sh, git push --force |

90% of classifications are deterministic (regex, zero latency). Only ambiguous cases invoke the LLM.

### Command Decomposition

Commands are split on unquoted `&&`, `||`, `;`, `|`, and `\n` — each segment classified individually. `ls && curl evil.com` is caught even though `ls` alone is safe. Quoted strings (`echo "safe && safe"`) are respected. Pipe-to-shell (`cat file | sh`) is blocked.

### Structural Blocking

The approval gate is a JavaScript Promise — the agent is structurally suspended until the user taps Approve or Deny in Telegram. There is no code path, no timeout hack, no config flag that bypasses this.

---

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **pnpm**
- **Ollama** with `qwen3:8b` model
- **Claude Code CLI** installed with Pro/Max subscription (for coding tasks)
- **Telegram Bot Token** (via [@BotFather](https://t.me/BotFather))
- Your **Telegram User ID** (via [@userinfobot](https://t.me/userinfobot))

### Setup

```bash
# 1. Pull the orchestrator model
ollama pull qwen3:8b

# 2. Clone and install
git clone https://github.com/slavko-at-klincov-it/geofrey.ai.git
cd geofrey.ai
pnpm install

# 3. Configure
cp .env.example .env
# Edit .env: set TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_ID

# 4. Run
pnpm dev
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `TELEGRAM_OWNER_ID` | Yes | — | Your Telegram user ID |
| `ORCHESTRATOR_MODEL` | No | `qwen3:8b` | Ollama model name |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama API URL |
| `DATABASE_URL` | No | `./data/app.db` | SQLite database path |
| `AUDIT_LOG_DIR` | No | `./data/audit` | Audit log directory |
| `MCP_SERVERS` | No | — | JSON array of MCP server configs |
| `MCP_ALLOWED_SERVERS` | No | — | Comma-separated allowlist of MCP server names |

#### Claude Code CLI

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed with an active Pro/Max subscription.

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CODE_ENABLED` | `true` | Enable/disable Claude Code integration |
| `CLAUDE_CODE_SKIP_PERMISSIONS` | `true` | Use `--dangerously-skip-permissions` (required for non-interactive) |
| `CLAUDE_CODE_MODEL` | `claude-sonnet-4-5-20250929` | Model for coding tasks |
| `CLAUDE_CODE_TIMEOUT_MS` | `600000` | Timeout per invocation (10 min) |
| `CLAUDE_CODE_MAX_BUDGET_USD` | — | Optional spend cap per invocation |
| `CLAUDE_CODE_DEFAULT_DIRS` | — | Comma-separated additional working directories |
| `CLAUDE_CODE_MCP_CONFIG` | — | Path to MCP config for Claude Code |

**Tool profiles** are automatically scoped by risk level:

| Risk Level | Tools Available |
|------------|----------------|
| L0 (read-only) | Read, Glob, Grep |
| L1 (standard) | Read, Glob, Grep, Edit, Write, Bash(git:*) |
| L2 (full) | Read, Glob, Grep, Edit, Write, Bash |

---

## Architecture

```
src/
├── index.ts                  # Entry point, health checks, graceful shutdown
├── orchestrator/
│   ├── agent-loop.ts         # Vercel AI SDK 6 generateText/streamText + approval flow
│   ├── conversation.ts       # Multi-turn memory (in-memory + SQLite)
│   └── prompt-generator.ts   # Task templates for downstream models
├── approval/
│   ├── risk-classifier.ts    # Hybrid: deterministic regex (90%) + LLM (10%)
│   ├── approval-gate.ts      # Promise-based blocking gate with nonce IDs
│   ├── action-registry.ts    # Action definitions + default risk levels
│   └── execution-guard.ts    # Final revocation check before execution
├── messaging/
│   ├── telegram.ts           # grammY bot + approval callback handlers
│   ├── approval-ui.ts        # InlineKeyboard formatting
│   └── streamer.ts           # Token streaming via Telegram message edits
├── tools/
│   ├── tool-registry.ts      # Native + MCP tool registry → AI SDK bridge
│   ├── mcp-client.ts         # MCP server discovery + tool wrapping
│   ├── claude-code.ts        # Claude Code CLI subprocess driver
│   ├── shell.ts              # Shell command executor
│   ├── filesystem.ts         # File read/write/delete/list
│   └── git.ts                # Git status/log/diff/commit
├── audit/
│   └── audit-log.ts          # Hash-chained JSONL (SHA-256, tamper-evident)
├── db/
│   ├── client.ts             # SQLite + Drizzle ORM setup
│   └── schema.ts             # Table definitions
└── config/
    ├── defaults.ts           # Env var loader
    └── schema.ts             # Zod config validation
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (Node.js 22+) |
| Orchestrator | Qwen3 8B via Ollama (upgradable to 14B) |
| Coding Agent | Claude Code CLI (stream-json, sessions, risk-scoped tool profiles) |
| LLM SDK | Vercel AI SDK 6 (`generateText`, `streamText`, `tool` with `needsApproval`) |
| Tool Integration | MCP Client (10K+ servers, wrapped by risk classifier) |
| Telegram | grammY (long polling, inline keyboards, live streaming) |
| Database | SQLite + Drizzle ORM |
| Audit | Append-only hash-chained JSONL (with Claude Code cost/token tracking) |
| Validation | Zod |

### Hardware Tiers

| Tier | RAM | Model | Cost |
|------|-----|-------|------|
| Minimum | 18GB+ (M-series Mac) | Qwen3 8B (5GB) | $0/month |
| Standard | 32GB+ | Qwen3 14B (9GB) | $0/month |
| Power | 96GB+ | Qwen3 14B + Qwen3-Coder-Next (61GB) | $0/month |

---

## Security

### vs. OpenClaw

| Attack Vector | OpenClaw | geofrey.ai |
|--------------|----------|------------|
| Network exposure | Web UI, 42K+ exposed instances | No web UI, Telegram only |
| RCE via browser | CVE-2026-25253 | No browser interface |
| Command injection | CVE-2026-25157 | L3 blocks + shlex decomposition per segment |
| Chained commands | `ls && curl evil` passes as single string | Split, each segment classified individually |
| Approval bypass | `elevated: "full"` | No bypass mode exists |
| Marketplace malware | 7.1% of skills leak credentials | No marketplace, MCP allowlist |
| Prompt injection | No defense | 3-layer defense + MCP output sanitization |
| LLM classifier evasion | JSON parsing fragile | XML primary (reliable with small models) + JSON fallback |
| Audit trail | Basic logs | SHA-256 hash-chained, tamper-evident, cost tracking |

### OWASP Agentic AI Top 10

Full coverage documented in [docs/WHITEPAPER.md](docs/WHITEPAPER.md).

---

## MCP Servers

Connect any MCP-compatible tool server:

```bash
# Via environment variable
MCP_SERVERS='[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/home/user"]}]' pnpm dev
```

All MCP tool calls are automatically routed through the risk classifier. The MCP ecosystem provides 10,000+ tool servers — geofrey.ai wraps them all with L0-L3 safety guarantees.

---

## Development

```bash
pnpm dev          # Run with hot reload (tsx watch)
pnpm build        # TypeScript compilation
pnpm lint         # Type check (tsc --noEmit)
pnpm test         # 106 tests across 12 modules
pnpm start        # Run compiled output
pnpm db:generate  # Generate Drizzle migrations
```

---

## Project Status

**106 tests passing** across 12 modules.

- [x] Local LLM orchestrator (Qwen3 8B)
- [x] Hybrid risk classification (deterministic + LLM, XML output)
- [x] Shlex-style command decomposition (prevents chained command bypass)
- [x] Structural approval gate (Promise-based blocking)
- [x] Telegram bot with approval UI + live streaming
- [x] Tool executors (shell, filesystem, git)
- [x] Claude Code CLI integration (stream-json, sessions, tool scoping, live Telegram streaming)
- [x] Prompt optimizer (8 templates, risk-scoped tool profiles)
- [x] 4-way intent classification (QUESTION / SIMPLE_TASK / CODING_TASK / AMBIGUOUS)
- [x] MCP client integration (allowlist, output sanitization)
- [x] Hash-chained audit log (with Claude Code cost/token/session tracking)
- [x] SQLite persistence (conversations, Claude Code sessions)
- [x] Security hardening (obfuscation-resistant L3 patterns, pipe-to-shell detection)
- [ ] End-to-end test suite
- [ ] Multi-messaging (WhatsApp, Discord)
- [ ] Web dashboard (read-only audit viewer)

---

## Feature Comparison

| Feature | OpenClaw | geofrey.ai |
|---------|----------|------------|
| Orchestrator | Cloud LLM ($200-600/mo) | Local Qwen3 8B (free) |
| Coding agent | Built-in (cloud) | Claude Code CLI (stream-json, sessions, tool scoping) |
| Approvals | Fire-and-forget | Promise-based structural blocking |
| Risk classification | Single LLM call | Hybrid: deterministic (~90%) + LLM (10%) |
| Command analysis | Whole-string regex | Shlex decomposition + per-segment classification |
| LLM classifier output | JSON | XML primary + JSON fallback |
| Tool integration | Custom + ClawHub | Native tools + MCP (10K+ servers) with allowlist |
| Prompt optimization | None | 8 task templates, risk-scoped tool profiles |
| Intent classification | Binary (question/task) | 4-way (QUESTION / SIMPLE_TASK / CODING_TASK / AMBIGUOUS) |
| Audit log | Plain text | Hash-chained JSONL (SHA-256, cost/token tracking) |
| Prompt injection defense | Minimal | 3-layer + MCP output sanitization |
| Messaging | Slack, Discord, WhatsApp, Telegram | Telegram (more planned) |
| Web UI | Yes (CVE-2026-25253) | No (intentional) |
| Permission bypass | `elevated: "full"` | None (intentional) |
| Public marketplace | ClawHub (7.1% leak creds) | None (intentional) |
| Multi-user | Yes | Single owner (personal agent) |
| Test coverage | Some | 106 tests, 12 modules |

### What We Explicitly Refuse to Build

| Feature | Reasoning |
|---------|-----------|
| Permission bypass mode | A bypass is a vulnerability, not a feature |
| Web UI | Zero public endpoints = zero web attack surface |
| Public marketplace | MCP ecosystem with allowlist instead — no unvetted community code |
| Auto-retry after denial | Timeout = denial, agent must not retry without new user input |
| Plaintext credential storage | Sensitive paths (.env, .ssh, .pem) are L3-blocked |

### Known Limitations

- **No execution sandbox** — relies on Claude Code's own sandboxing
- **Single-user only** — personal agent, restricted by `TELEGRAM_OWNER_ID`
- **No offline mode** — Telegram required for approvals
- **Orchestrator ceiling** — Qwen3 8B at 0.933 F1 (upgrade to 14B at 0.971 F1 on 32GB+ systems)

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — Full system design, dataflow, risk levels
- [Orchestrator Prompts](docs/ORCHESTRATOR_PROMPT.md) — 4 focused prompts for Qwen3
- [Whitepaper](docs/WHITEPAPER.md) — Security analysis, cost comparison, market opportunity

---

## License

Open Source — License TBD
