# openClawNurBesser

## Overview
A better alternative to [OpenClaw](https://github.com/openclaw/openclaw) (formerly Clawdbot/Moltbot) — an open-source personal AI agent with a **local LLM as orchestrator** that acts as a safety layer, prompt optimizer, and user communication bridge.

## Core Concept
1. **Local LLM Orchestrator** (Qwen3 8B via Ollama, upgradable to 14B) — reviews and approves actions before execution
2. **User Confirmation via Messaging** — "Do you really want to delete these photos?" via Telegram
3. **Hybrid Risk Classification** — deterministic patterns + LLM for ambiguous cases
4. **MCP Integration** — access 10K+ tool servers, wrapped by our safety layer
5. **Resource Efficient** — local inference instead of expensive cloud API loops ($200-600/mo with OpenClaw)

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Language | **TypeScript** (Node.js ≥22) |
| Orchestrator LLM | **Qwen3 8B** via Ollama (default) · Qwen3 14B (upgrade for 32GB+) |
| Code Worker (future) | **Qwen3-Coder-Next** via Ollama (optional, 96GB+ RAM) |
| LLM SDK | **Vercel AI SDK 6** (`ai` + `ai-sdk-ollama`) — ToolLoopAgent, needsApproval |
| Tool Integration | **MCP Client** (`@modelcontextprotocol/sdk`) wrapped by risk classifier |
| Messaging | **grammY** (Telegram) · **Cloud API** (WhatsApp) · **signal-cli** (Signal) |
| Subprocess | **execa** |
| State/DB | **SQLite** (better-sqlite3 + **Drizzle ORM**) |
| Audit | Append-only hash-chained **JSONL** (SHA-256) |
| Validation | **Zod** (Standard Schema compatible) |
| Package Manager | **pnpm** |
| Code language | English |
| Communication | German (user preference) |

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
│   └── prompt-generator.ts  # Task templates for downstream models
├── approval/
│   ├── risk-classifier.ts   # Hybrid: deterministic patterns + LLM fallback
│   ├── approval-gate.ts     # Promise-based blocking gate (nonce IDs)
│   ├── action-registry.ts   # Action definitions + escalation rules
│   └── execution-guard.ts   # Final revocation check
├── messaging/
│   ├── platform.ts          # MessagingPlatform interface + types
│   ├── create-platform.ts   # Async factory: config → adapter
│   ├── streamer.ts          # Platform-agnostic token streaming
│   └── adapters/
│       ├── telegram.ts      # grammY bot + approval UI (inline buttons)
│       ├── whatsapp.ts      # WhatsApp Business API (Cloud API, webhook)
│       └── signal.ts        # signal-cli JSON-RPC (text-based approvals)
├── tools/
│   ├── tool-registry.ts     # Tool schema + handler registry (native + MCP)
│   ├── mcp-client.ts        # MCP server discovery + tool wrapping
│   ├── claude-code.ts       # Claude Code CLI driver
│   ├── shell.ts             # Shell command executor
│   ├── filesystem.ts        # File operations
│   └── git.ts               # Git operations
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
│   │   ├── claude-auth.ts   # Claude Code authentication
│   │   └── summary.ts       # Config review + .env generation
│   └── utils/
│       ├── ui.ts            # chalk/ora formatting
│       ├── prompt.ts        # German prompt wrappers (@inquirer/prompts)
│       ├── validate.ts      # Token/credential validators
│       ├── clipboard.ts     # clipboardy wrapper
│       └── ocr.ts           # tesseract.js OCR pipeline
└── config/
    ├── defaults.ts          # Default settings
    └── schema.ts            # Zod config validation
```

## Project Status
- [x] Project initialized
- [x] Research: local LLM options → **Qwen3 8B default, 14B upgrade**
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
- [x] Unit tests (179 tests, 26 modules — node:test runner)
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
- [ ] End-to-end testing

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
| 2026-02-11 | Qwen3 14B as upgrade orchestrator | 0.971 F1, 9GB Q4 — for 32GB+ RAM systems |
| 2026-02-11 | Qwen3-Coder-Next as future code worker | 70.6% SWE-Bench, 80B/3B MoE, 52GB Q4 — for 96GB+ RAM (tiered routing) |
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
| 2026-02-11 | Power tier needs 96GB+ (not 64GB) | Both models loaded = ~61GB, leaves no headroom on 64GB |
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
