# geofrey.ai — Local-First AI Agent Security

**A safer, cheaper alternative to cloud-dependent AI agent platforms**

*Technical Whitepaper v1.0 — February 2026*

---

## Executive Summary

AI agent platforms like OpenClaw (formerly Clawdbot/Moltbot) promise autonomous task execution but suffer from three systemic failures: **runaway costs** ($200-600+/month), **critical security vulnerabilities** (CVE-2026-25253, 42,000+ exposed instances), and **broken safety mechanisms** (fire-and-forget approvals that never actually block).

geofrey.ai solves all three by running a local LLM as a security orchestrator between the user and tool execution. No cloud API loops, no exposed web interfaces, no bypasses. The agent structurally cannot execute dangerous actions without explicit user approval via Telegram, WhatsApp, or Signal.

**Key numbers:**
- **$0/month** orchestrator cost (local Qwen3 8B, 5GB RAM)
- **0** exposed network ports (Telegram long polling / WhatsApp webhook / Signal socket, no web UI)
- **0** code paths from "pending approval" to "execute" without user tap
- **90%** of risk classifications handled instantly by deterministic patterns (no LLM latency)

---

## The Problem

### 1. AI Agents Are Expensive

Cloud-based AI agent platforms route every decision through paid API calls. OpenClaw users report:

- **$3,600/month** (Federico Viticci, power user)
- **$200/day** (Reddit user, misconfigured monitoring)
- **$623/month** (developer invoice, moderate usage)
- **$47 in 5 days** (test period, minimal usage)

The root cause: autonomous monitoring generates 4,320+ API calls/month *before any user commands*. Every screenshot analysis, every tool-call classification, every conversation turn costs tokens. The system prompt alone is 10,000+ tokens, resent on every API call.

### 2. AI Agents Are Insecure

The OWASP Top 10 for Agentic AI Applications (December 2025) identified cascading failures, excessive agency, and prompt injection as critical risks. OpenClaw demonstrates all of them:

**CVE-2026-25253** (CVSS 8.8): One-click remote code execution via cross-site WebSocket hijacking. Missing origin header validation allows any malicious webpage to execute arbitrary commands.

**CVE-2026-25157**: Command injection in gateway components allowing arbitrary OS command execution.

**Scale of exposure:**
- 42,900 unique IPs hosting exposed OpenClaw control panels across 82 countries
- 15,200 instances vulnerable to RCE
- Hundreds of malicious skills found in ClawHub marketplace
- 7.1% of ClawHub skills leak credentials

**Q4 2025 attack trends** (Lakera, Adversa AI): indirect prompt injection succeeds with fewer attempts and broader impact than direct attacks. AI agents processing PII, credentials, and transactions without proper controls. The EchoLeak vulnerability (CVE-2025-32711) demonstrated zero-click prompt injection in Microsoft 365 Copilot.

### 3. AI Agent Safety Mechanisms Don't Actually Work

OpenClaw's approval system has a fundamental architectural flaw documented in **GitHub Issue #2402**: the approval flow is fire-and-forget.

```typescript
// OpenClaw bash-tools.exec.ts, lines 1016, 1197
void (async () => {
  // Tool returns immediately (~16ms)
  // Does NOT wait for user approval
})();
```

The tool execution returns before the user has a chance to approve or deny. By the time the user taps "Approve," the approval ID is orphaned. The `elevated: "full"` permission mode bypasses all safety entirely.

**No enforceable trust boundary exists** between untrusted inputs and high-privilege tool invocation.

---

## Our Solution

geofrey.ai is a local-first AI agent with a fundamentally different security architecture:

```
User (Telegram/WhatsApp/Signal) → Local Orchestrator (Qwen3 8B) → Risk Classifier (L0-L3)
                        ↕                                ↓
                  Approval Gate ◄── L2: Promise blocks until user approves
                        ↓
                  Tool Execution → Audit Log (hash-chained)
```

### Core Innovation: Structural Blocking

The approval gate uses a JavaScript Promise that structurally suspends the agent. There is no code path from "pending" to "execute" without the Promise resolving — which only happens when the user approves (via inline button on Telegram/WhatsApp, or text reply on Signal).

```typescript
const { nonce, promise } = createApproval(toolName, args, classification);
// Agent is suspended here — no setTimeout, no polling, no bypass
const approved = await promise;  // Resolves ONLY on user action
```

This is not a policy that can be overridden. It is a structural property of the execution flow.

### Four Layers of Defense

| Layer | Threat | Defense |
|-------|--------|---------|
| **Command decomposition** | Chained command bypass (`ls && curl evil`) | Shlex-style split on unquoted `&&`, `||`, `;`, `|`, `\n` — each segment classified individually |
| **Deterministic classifier** | Known dangerous patterns | Regex blocks rm -rf, sudo, curl\|sh, force-push, pipe-to-shell in <1ms |
| **LLM classifier** | Ambiguous commands | Qwen3 8B classifies edge cases with XML output (more reliable than JSON for small models) |
| **Approval gate** | Unauthorized execution | Promise-based blocking — no code path around it |

### Four-Tier Risk Classification

| Level | Action | Examples |
|-------|--------|----------|
| **L0** Auto-Approve | Execute immediately | read_file, git status, ls |
| **L1** Notify | Execute + inform user | write_file (non-config), git add |
| **L2** Require Approval | **Block until user taps Approve** | delete_file, git commit, npm install, shell_exec |
| **L3** Block | Refuse always, log attempt | rm -rf, sudo, curl, git push --force |

90% of classifications are handled by deterministic pattern matching (zero latency, zero cost). Only genuinely ambiguous cases invoke the LLM.

### Claude Code as Intelligent Coding Backend

The local LLM doesn't try to write code — it acts as a **communication bridge, prompt optimizer, and safety layer** that delegates coding tasks to Claude Code CLI (Pro/Max subscription):

1. **Intent classification** — the orchestrator determines if a request is a QUESTION, SIMPLE_TASK, CODING_TASK, or AMBIGUOUS
2. **Prompt optimization** — 8 task templates (bug_fix, refactor, new_feature, debugging, code_review, test_writing, documentation, freeform) generate focused prompts
3. **Tool scoping** — Claude Code's available tools are restricted by risk level (L0 = read-only, L1 = standard, L2 = full)
4. **Session tracking** — multi-turn coding tasks reuse sessions via `--session-id` (1h TTL)
5. **Live streaming** — Claude Code output is streamed to messaging platform in real-time (edits on Telegram, new messages on WhatsApp/Signal)
6. **Audit trail** — every invocation logs cost, tokens, model, session ID, and allowed tools

This architecture means the local LLM handles the cheap, frequent work (intent classification, risk assessment, user communication) while Claude Code handles the expensive, complex work (multi-file edits, debugging, refactoring).

---

## Cost Comparison

| Scenario | OpenClaw | geofrey.ai |
|----------|----------|------------|
| Orchestrator | Claude/GPT API ($0.01-0.06/1K tokens) | Qwen3 8B local (free) |
| 100 tasks/day | ~$150-400/month | $0 orchestrator + selective API for code tasks |
| Monitoring | 4,320 API calls/month (background) | 0 (event-driven, no polling) |
| System prompt | 10K tokens resent per call | Local model, loaded once |
| **Total (moderate use)** | **$200-600/month** | **$0-30/month** (only complex code tasks use API) |

The orchestrator handles intent classification, risk assessment, and task decomposition locally. Cloud APIs are only used for complex code generation tasks that exceed local model capabilities — reducing API costs by an estimated 70-90%.

### Hardware Requirements

- **RAM:** 18GB+ (M-series Mac or equivalent)
- **Orchestrator:** Qwen3 8B via Ollama (~5GB Q4, ~40 tok/s on Apple Silicon) — $0/month
- **Configurable:** `ORCHESTRATOR_MODEL` env var accepts any Ollama model

**Coming soon:** [Qwen3-Coder-Next](https://www.marktechpost.com/2026/02/03/qwen-team-releases-qwen3-coder-next-an-open-weight-language-model-designed-specifically-for-coding-agents-and-local-development/) as local code worker — 80B MoE / 3B active parameters, 70.6% SWE-Bench Verified, enabling on-device coding for simple tasks and reducing API costs by ~30-40% (requires 64GB+ RAM, ~52GB Q4).

---

## Security Architecture

### vs. OpenClaw Security Model

| Attack Vector | OpenClaw | geofrey.ai |
|--------------|----------|------------|
| **Network exposure** | Web UI on public ports (42K exposed instances) | No web UI, messaging only (Telegram/WhatsApp/Signal) |
| **RCE via browser** | CVE-2026-25253 (CVSS 8.8) | No browser interface, no WebSocket |
| **Command injection** | CVE-2026-25157, CVE-2026-24763 (Docker sandbox PATH injection) | L3 blocks + shlex decomposition (each segment classified individually) |
| **Approval bypass** | `elevated: "full"` skips all checks | No bypass mode exists |
| **Marketplace malware** | 7.1% of ClawHub skills leak credentials | No marketplace, explicit tool registry + MCP allowlist |
| **Prompt injection** | No specific defense | 3-layer defense + MCP output sanitization |
| **LLM classifier evasion** | JSON parsing fragile with small models | XML output (reliable with Qwen3 8B) + JSON fallback |
| **Secret handling** | Plaintext credentials in local files (infostealer target) | Env-only, Zod-validated, no token logging, subprocess env isolation |
| **Filesystem access** | Unrestricted (agent can read `/etc/passwd`, `.ssh/`) | `confine()` rejects paths outside `process.cwd()` |
| **MCP output trust** | Unsafe type assertions on tool responses | Zod schema validation (`safeParse`) + instruction filtering |
| **Image metadata** | No sanitization | EXIF/XMP/IPTC stripping + prompt injection scanning via sharp |
| **Audit trail** | Basic logs | Hash-chained JSONL (SHA-256, tamper-evident, cost tracking) |

### OWASP Agentic AI Top 10 Coverage

| # | Risk | Our Mitigation |
|---|------|---------------|
| ASI01 | Agent Goal Hijack | Local orchestrator reviews all instructions; prompt injection defense; image metadata sanitization |
| ASI02 | Tool Misuse | Hybrid risk classifier + structural approval gate |
| ASI03 | Identity & Privilege Abuse | No cloud credentials stored; env-only secrets; subprocess env isolation; no elevated bypass |
| ASI04 | Supply Chain Vulnerabilities | No marketplace; explicit tool registry + MCP whitelist; Zod response validation |
| ASI05 | Unexpected Code Execution | L2/L3 classification for all shell/code execution |
| ASI06 | Memory & Context Poisoning | Hash-chained audit log; conversation isolation |
| ASI07 | Insecure Inter-Agent Communication | Single orchestrator; downstream output treated as DATA |
| ASI08 | Cascading Failures | Isolated error handling per tool; max 15 iterations; 60s timeout |
| ASI09 | Human-Agent Trust Exploitation | Explicit approval for every high-risk action |
| ASI10 | Rogue Agents | Local orchestrator as safety layer; iteration + token limits |

### Secret Handling & Credential Isolation

Unlike OpenClaw, where plaintext credentials in local files provide an easy target for infostealer malware, geofrey.ai enforces strict credential isolation:

1. **Environment-only secrets** — all credentials (`TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, etc.) loaded exclusively from environment variables, validated at startup with Zod schemas that map missing values to human-readable error messages (e.g., "Missing `TELEGRAM_BOT_TOKEN` (env: TELEGRAM_BOT_TOKEN)")
2. **No token logging** — no `console.log`, error handler, or audit entry ever contains credential values
3. **Subprocess env isolation** — `ANTHROPIC_API_KEY` passed to Claude Code as a process environment variable (not a CLI argument), making it invisible in `ps` output and process lists
4. **Sensitive path escalation** — file paths matching `.env`, `.ssh`, `.pem`, `credentials`, and similar patterns are automatically escalated to L3 (blocked) — the agent cannot read its own credential files
5. **No persistent credential storage** — credentials live only in process memory and the `.env` file (which the agent itself cannot access due to L3 classification)

### Filesystem Confinement

All filesystem operations (`read_file`, `write_file`, `delete_file`, `list_directory`) pass through `confine()`, which resolves paths via `node:path.resolve()` and rejects anything outside `process.cwd()`. This prevents:

- Path traversal attacks (`../../../etc/passwd`)
- Symlink-based escapes (resolved before boundary check)
- Agent accessing system files, SSH keys, or credentials outside the project directory

### MCP Response Validation

MCP tool responses are validated with `mcpContentSchema.safeParse()` (Zod) instead of unsafe `as` type assertions. Additionally, MCP output is sanitized before reaching the orchestrator:

- **Instruction filtering** — phrases like "you must", "execute", "call the tool" are stripped
- **Fake XML tag removal** — tags like `<system>`, `<instruction>`, `<tool_call>` are removed
- **DATA boundary wrapping** — sanitized output wrapped in `<mcp_data>` tags, which the orchestrator system prompt treats as data-only (never as instructions)

This three-step pipeline prevents prompt injection via compromised or malicious MCP tool servers.

### Image Metadata Sanitization

Image metadata (EXIF, XMP, IPTC, PNG text chunks) is a known side channel for prompt injection. An attacker can embed instructions like `ignore previous instructions` or `<system>override safety</system>` in an image's EXIF comment field — invisible to users but parsed by multimodal LLMs.

geofrey.ai strips all metadata before images reach the orchestrator:

1. **Format detection** — magic byte validation (JPEG, PNG, WebP, TIFF, GIF) rejects unknown formats
2. **Metadata extraction + scanning** — raw EXIF/XMP/IPTC buffers converted to UTF-8 and scanned against injection patterns (instruction phrases, XML tag injection, jailbreak keywords, DAN patterns)
3. **Metadata stripping** — `sharp` pipeline removes all metadata while preserving EXIF orientation
4. **Audit logging** — suspicious findings logged with risk escalation (clean = L0, suspicious = L2)

This extends the 3-layer prompt injection defense to cover the image metadata side channel.

---

## Technology Stack

| Component | Choice | Why |
|-----------|--------|-----|
| **Orchestrator LLM** | Qwen3 8B via Ollama | 0.933 tool-call F1, 5GB Q4_K_M, ~40 tok/s on M-series |
| **LLM SDK** | Vercel AI SDK 6 | Native tool approval hooks, Ollama provider, Zod schemas |
| **Tool Integration** | MCP (Model Context Protocol) | Linux Foundation standard, 10K+ servers, wrapped by risk classifier |
| **Messaging** | grammY (Telegram), Cloud API (WhatsApp), signal-cli (Signal) | Multi-platform approval flow with platform-specific UI |
| **Database** | SQLite + Drizzle ORM | Zero-config, type-safe, persistent conversations |
| **Audit** | Hash-chained JSONL | Tamper-evident, append-only, human-readable, verifiable |
| **Language** | TypeScript (Node.js 22+) | Async-native, same ecosystem as existing AI tooling |

### MCP Integration

The Model Context Protocol (adopted by the Linux Foundation) gives geofrey.ai access to 10,000+ community tool servers — filesystem, git, databases, APIs, browser automation. Every MCP tool call goes through our risk classifier before execution, providing safety guarantees that the MCP ecosystem itself does not enforce.

---

## Market Opportunity

### AI Agent Market

- **2025**: $7.6 billion
- **2030**: $50.3 billion (CAGR 45.8%)
- **79%** of employees already using AI agents
- **81%** of leaders expect integration within 12-18 months

*Source: MarketsandMarkets, DemandSage*

### Local LLM Adoption

- **42%** of developers running LLMs locally by 2026
- LLM market growing from $6.4B (2024) to $36.1B (2030)
- Primary drivers: privacy, cost reduction, latency
- Ollama adoption accelerating as inference quality approaches cloud models

*Source: Hostinger, Index.dev, Typedef*

### Our Position

The intersection of **AI agent security** and **local-first AI** is underserved. Cloud platforms optimize for capability (more tools, more autonomy). We optimize for **controllability** (safety guarantees, cost predictability, data sovereignty).

Target users:
1. **Developers** who want AI automation without $600/month bills
2. **Privacy-conscious professionals** who can't send data to cloud APIs
3. **Security teams** evaluating AI agent deployments (OWASP compliance)
4. **Small teams** who need AI tooling without enterprise contracts

---

## Competitive Landscape

| Feature | OpenClaw | Warp AI | Cursor | geofrey.ai |
|---------|----------|---------|--------|------------|
| Local orchestrator | No | No | No | **Yes** |
| Structural approval blocking | No (fire-and-forget) | N/A | N/A | **Yes** |
| Command decomposition | No | N/A | N/A | **Yes** (shlex-style) |
| Risk-scoped tool profiles | No | N/A | N/A | **Yes** (L0→readOnly, L1→standard, L2→full) |
| Monthly cost (moderate use) | $200-600 | $15-50 | $20-40 | **$0-30** |
| Network exposure | Web UI (42K exposed) | Cloud | Cloud | **None** |
| MCP ecosystem | Yes | No | No | **Yes** (with allowlist) |
| OWASP Agentic coverage | Partial | N/A | N/A | **Full** |
| Open source | Yes | No | No | **Yes** |
| Data sovereignty | Cloud-dependent | Cloud | Cloud | **100% local** |
| Test coverage | Some | N/A | N/A | **298 tests, 65 suites** |
| Image metadata defense | None | N/A | N/A | **EXIF/XMP/IPTC stripping + injection scan** |

---

## Roadmap

### Phase 1 — Foundation (Complete)
- [x] Local LLM orchestrator (Qwen3 8B via Ollama)
- [x] 4-tier risk classification (hybrid deterministic + LLM)
- [x] Structural approval gate (Promise-based blocking)
- [x] Multi-platform messaging (Telegram, WhatsApp, Signal) with approval UI + live streaming
- [x] Tool executors (shell, filesystem, git)
- [x] MCP client integration (allowlist, output sanitization)
- [x] Hash-chained audit log
- [x] SQLite persistence
- [x] 298 tests (266 unit + 32 E2E integration) across 65 suites

### Phase 1.5 — Claude Code Integration + Security Hardening (Complete)
- [x] XML-based LLM classifier output (more reliable with small models, JSON fallback)
- [x] Shlex-style command decomposition (prevents chained command bypass)
- [x] Claude Code CLI driver rewrite (stream-json, sessions, tool scoping)
- [x] Prompt optimizer (8 templates, risk-scoped tool profiles)
- [x] 4-way intent classification (QUESTION / SIMPLE_TASK / CODING_TASK / AMBIGUOUS)
- [x] Claude Code live streaming to all messaging platforms
- [x] Session tracking + audit log extension (cost, tokens, model, session ID)
- [x] i18n: German + English with typed `t()` function (`LOCALE` config, setup wizard language selection)

### Phase 1.75 — Production Readiness (Complete)
- [x] End-to-end integration test suite (32 tests)
- [x] Ollama error handling (3 retries, user-friendly connection errors)
- [x] Human-readable startup config errors (Zod → env var mapping)
- [x] Docker support (multi-stage Dockerfile + docker-compose.yml with Ollama + GPU)
- [x] Deployment guide (Docker, systemd, PM2, production tips)
- [x] npm CLI entry point (`geofrey` / `geofrey setup`)
- [x] GitHub Actions CI (Node 22, pnpm, lint + test)
- [x] CHANGELOG.md + MIT LICENSE
- [x] ~~v1.0.0 release~~ (deleted due to bugs)

### Phase 2 — Hardening (Next)
- [x] Image metadata sanitization (EXIF/XMP/IPTC stripping + prompt injection scanning)
- [ ] Token budget enforcement
- [ ] Approval timeout with configurable policy
- [ ] Rate limiting for tool execution

### Phase 3 — Expansion
- [ ] Additional messaging platforms (Discord, Slack)
- [ ] Web dashboard (read-only audit viewer, no control plane)
- [ ] Tiered model routing (local for simple, API for complex)
- [ ] Multi-user support with role-based permissions
- [ ] Plugin system for custom tool definitions

### Phase 4 — Enterprise
- [ ] SOC 2 compliance documentation
- [ ] Audit log export (SIEM integration)
- [ ] Policy-as-code (Rego/OPA for custom risk rules)
- [ ] On-premise deployment package
- [ ] SLA-backed support tier

---

## Team

*[To be filled]*

---

## Contact

- **Repository**: [github.com/slavko-at-klincov-it/geofrey.ai](https://github.com/slavko-at-klincov-it/geofrey.ai)
- **License**: MIT

---

*This document contains forward-looking statements about product capabilities and market projections. Current implementation status is documented in CLAUDE.md.*
