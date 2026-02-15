# Key Decisions Log

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-02-11 | Project created | Privacy-first AI agent with local LLM orchestrator |
| 2026-02-11 | Qwen3 8B as default orchestrator | 0.933 F1, 5GB Q4, ~40 tok/s — fits 18GB RAM comfortably |
| 2026-02-11 | Mandatory blocking approvals | Fire-and-forget approval is architecturally broken — Promise-based blocking has no code path around it |
| 2026-02-11 | TypeScript over Python | Async-native, better subprocess mgmt, same ecosystem as Claude Code |
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
| 2026-02-12 | Interactive setup wizard | `pnpm setup` — auto-detection, OCR, clipboard, real-time validation |
| 2026-02-12 | Filesystem directory confinement | `confine()` rejects paths outside `process.cwd()` — prevents path traversal |
| 2026-02-12 | MCP Zod response validation | `mcpContentSchema.safeParse()` replaces unsafe `as` assertions on MCP tool output |
| 2026-02-12 | i18n with typed key-value maps | No external library; `t()` function + `satisfies` compile-time completeness; `de` + `en` locales |
| 2026-02-12 | Image metadata sanitization | EXIF/XMP/IPTC can carry prompt injection — strip before LLM, scan for patterns, audit findings |
| 2026-02-13 | Privacy Layer architecture | Aggressive opt-out anonymization, Qwen3-VL-2B for images, dual storage (SQLite + MD), approval-based learning |
| 2026-02-13 | Hub-and-Spoke multi-agent routing | 3 strategies (skill/intent/explicit); per-agent session isolation; persistent agent configs |
| 2026-02-13 | Removed TTS (ElevenLabs) | Cloud dependency violates local-first philosophy. Local TTS (Piper/Coqui) if needed |
| 2026-02-14 | User Profile in JSON, not DB | User can read/edit `.geofrey/profile.json`, version-control it |
| 2026-02-14 | Proactive Jobs via existing Scheduler | `__proactive_` prefix for routing; reuses cron/every jobs |
| 2026-02-14 | Privacy rules in SQLite, not config | Rules are dynamic (created via approval flow), need CRUD; config is static |
| 2026-02-14 | VL model on-demand (load → unload) | Qwen3-VL-2B uses 2GB RAM; load per-image, unload after to keep footprint low |
| 2026-02-14 | Auto-Tooling: Docker-first, direct fallback | Docker preferred for isolation; falls back to direct execution if Docker unavailable |
| 2026-02-14 | 20 native local-ops tools (v2.3) | Simple OS ops handled locally — saves cloud tokens |
| 2026-02-14 | E2E-first testing policy | 1248 green unit tests hid 6 critical bugs. See `docs/E2E_FINDINGS.md`. |
