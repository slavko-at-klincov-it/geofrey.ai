# geofrey.ai

**Local-first AI agent with structural safety guarantees.**

A personal AI assistant that runs a local LLM (Qwen3 8B) as a security orchestrator — classifying risk, blocking dangerous actions, and requiring explicit approval via Telegram before executing anything irreversible. No cloud API loops, no exposed web interfaces, no bypasses.

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
                  Tool Execution → Audit Log (SHA-256 hash-chained)
```

### Risk Levels

| Level | Action | Examples |
|-------|--------|----------|
| **L0** Auto | Execute immediately | read_file, git status, ls |
| **L1** Notify | Execute + inform | write_file, git add, npm test |
| **L2** Approve | **Block until user approves** | delete_file, git commit, shell_exec |
| **L3** Block | Refuse always | rm -rf, sudo, curl\|sh, git push --force |

90% of classifications are deterministic (regex, zero latency). Only ambiguous cases invoke the LLM.

### Structural Blocking

The approval gate is a JavaScript Promise — the agent is structurally suspended until the user taps Approve or Deny in Telegram. There is no code path, no timeout hack, no config flag that bypasses this.

---

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **pnpm**
- **Ollama** with `qwen3:8b` model
- **Telegram Bot Token** (via [@BotFather](https://t.me/BotFather))

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
| LLM SDK | Vercel AI SDK 6 (`generateText`, `streamText`, `tool` with `needsApproval`) |
| Tool Integration | MCP Client (10K+ servers, wrapped by risk classifier) |
| Telegram | grammY (long polling, inline keyboards) |
| Database | SQLite + Drizzle ORM |
| Audit | Append-only hash-chained JSONL |
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
| Command injection | CVE-2026-25157 | L3 blocks injection patterns |
| Approval bypass | `elevated: "full"` | No bypass mode exists |
| Marketplace malware | 7.1% of skills leak credentials | No marketplace |
| Prompt injection | No defense | 3-layer defense |
| Audit trail | Basic logs | SHA-256 hash-chained, tamper-evident |

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
pnpm start        # Run compiled output
pnpm db:generate  # Generate Drizzle migrations
```

---

## Project Status

- [x] Local LLM orchestrator (Qwen3 8B)
- [x] Hybrid risk classification (deterministic + LLM)
- [x] Structural approval gate
- [x] Telegram bot with approval UI + streaming
- [x] Tool executors (shell, filesystem, git, Claude Code)
- [x] MCP client integration
- [x] Hash-chained audit log
- [x] SQLite persistence (conversations, approvals)
- [ ] End-to-end test suite
- [ ] Error recovery + retry logic
- [ ] Multi-messaging (WhatsApp, Discord)
- [ ] Web dashboard (read-only audit viewer)

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — Full system design, dataflow, risk levels
- [Orchestrator Prompts](docs/ORCHESTRATOR_PROMPT.md) — 3 focused prompts for Qwen3
- [Whitepaper](docs/WHITEPAPER.md) — Security analysis, cost comparison, market opportunity

---

## License

Open Source — License TBD
