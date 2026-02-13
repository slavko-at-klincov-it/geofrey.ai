# Geofrey v2.0 — Full Codebase Audit

> Copy this entire prompt into a Claude Code session with `--dangerously-skip-permissions`.

---

## Mission

Perform a **comprehensive audit** of the entire Geofrey codebase after all 4 phases of development. Identify and fix: integration issues, security gaps, conflicting logic, broken patterns, dead code, and anything that undermines our core principles (security-first, better than OpenClaw).

This is NOT about adding features. This is about **quality, correctness, and coherence**.

---

## Step 1: Read Everything (mandatory)

Read these files completely before doing anything else:

**Core docs:**
- `CLAUDE.md` — project context, principles, conventions, decisions
- `docs/ARCHITECTURE.md` — system architecture
- `docs/OPENCLAW_GAP_ANALYSIS.md` — our competitive advantages
- `CHANGELOG.md` — all changes across 4 phases

**Core source (read ALL of these):**
- `src/index.ts` — main wiring, startup, shutdown
- `src/config/schema.ts` + `src/config/defaults.ts` — all config
- `src/db/schema.ts` + `src/db/client.ts` — DB schema + migrations
- `src/approval/risk-classifier.ts` — risk classification (our security backbone)
- `src/approval/approval-gate.ts` + `src/approval/execution-guard.ts`
- `src/orchestrator/agent-loop.ts` + `src/orchestrator/conversation.ts`
- `src/tools/tool-registry.ts` — tool registration
- `src/messaging/platform.ts` + `src/messaging/create-platform.ts`
- `src/i18n/keys.ts` + `src/i18n/locales/de.ts` + `src/i18n/locales/en.ts`

---

## Step 2: Audit Categories

Run **7 audit subagents in parallel** using the Task tool (`subagent_type: "general-purpose"`, all 7 in a single message). Each subagent reports findings as a structured list: `[CRITICAL]`, `[HIGH]`, `[MEDIUM]`, `[LOW]`, `[OK]`.

### Subagent 1: Security Audit
Prompt: "Read `CLAUDE.md`, `src/approval/risk-classifier.ts`, `src/approval/approval-gate.ts`, `src/approval/execution-guard.ts`, `src/security/image-sanitizer.ts`, `src/sandbox/container.ts`, `src/sandbox/volume-mount.ts`, `src/tools/shell.ts`, `src/tools/filesystem.ts`, `src/tools/mcp-client.ts`, and ALL tool files in `src/tools/`. Then audit:

1. **Risk classification completeness** — is EVERY tool action classified? Are there any tools that can execute without risk assessment? Check every `registerTool()` call and verify it has a matching pattern in `risk-classifier.ts`.
2. **L3 bypass potential** — can any combination of tools bypass L3 blocks? E.g., can `process_spawn` run a blocked command? Can `browser evaluate` execute `fetch()` to exfiltrate data? Can `webhook` + `shell` chain into unclassified execution?
3. **Sandbox escape** — if sandbox is enabled, can any tool bypass it? Check that `shell.ts` actually routes through Docker when sandbox is on. Check `volume-mount.ts` for path traversal.
4. **MCP safety** — is MCP output sanitization still applied to all MCP tool results? Are DATA boundary tags intact? Is the allowlist enforced?
5. **Prompt injection layers** — are all 3 layers (user input, tool output, model response) still isolated? Check that new Phase 3/4 tools don't break this.
6. **Filesystem confinement** — does `confine()` still apply to all filesystem operations including new tools?
7. **Auth token exposure** — are API keys (ElevenLabs, Google, Hue, HA, Slack, Discord) properly handled? Never logged, never in audit log, never sent to LLM?
8. **Companion WebSocket auth** — is the pairing flow secure? Can an unauthenticated client connect?
9. **Google OAuth token storage** — are tokens encrypted at rest? Are refresh tokens protected?
10. **Webhook HMAC validation** — is it timing-safe? Can webhooks be created without authentication?
11. **Agent-to-agent escalation** — can a specialist agent escalate its own permissions by communicating with another agent?
12. **Skill marketplace** — can a malicious skill from marketplace bypass permission manifest?

Report ALL findings. For each issue, provide: file, line, severity, description, fix suggestion."

### Subagent 2: Integration Coherence Audit
Prompt: "Read `src/index.ts`, `src/config/schema.ts`, `src/config/defaults.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/messaging/create-platform.ts`, `src/messaging/platform.ts`, and ALL adapter files in `src/messaging/adapters/`. Then audit:

1. **Startup sequence** — does `src/index.ts` initialize everything in the right order? Are there race conditions? (e.g., agent loop starting before DB is ready, webhook server starting before tool registry is populated)
2. **Shutdown sequence** — does graceful shutdown clean up EVERYTHING? Check: sandbox containers, tracked processes, webhook server, companion WebSocket, scheduled jobs, browser sessions, agent sessions. Are there dangling resources?
3. **Config coherence** — are all env vars in `defaults.ts` actually used? Are all schema fields mapped to env vars? Are there orphaned config fields?
4. **DB schema consistency** — do all tables have proper foreign keys where needed? Are there missing indexes? Do new Phase 3/4 tables follow the same patterns as Phase 1/2?
5. **Platform adapter completeness** — do ALL adapters (telegram, whatsapp, signal, slack, discord, webchat, companion) implement the FULL `MessagingPlatform` interface including optional methods (`sendAudio`)? Are there missing stubs?
6. **Tool registration** — are ALL tools imported in `src/index.ts`? Are there any tool files that exist but aren't registered?
7. **Multi-agent + single-agent** — when `agents.enabled = false`, does everything work exactly as before? Is the hub agent properly bypassed?
8. **Feature flags** — when features are disabled (sandbox, agents, companion, smart-home, google, webhook, tts), is there ZERO overhead? No unnecessary imports, no failed connections, no error spam?

Report ALL findings with file, line, severity, description, fix."

### Subagent 3: Code Quality & Convention Audit
Prompt: "Read `CLAUDE.md` for conventions, then scan the ENTIRE `src/` directory. Audit:

1. **TypeScript strictness** — any `any` types? Any unsafe `as` casts? Any `@ts-ignore`? These violate our strict TypeScript principle.
2. **Classes vs functions** — are there any classes? We use functions + closures exclusively.
3. **Default exports** — any `export default`? We use named exports only.
4. **Import extensions** — are ALL imports using `.js` extensions? Missing extensions break ESM.
5. **Dead code** — unused functions, unreachable branches, commented-out code, TODO comments that were never resolved.
6. **Error handling** — do all tool `execute` functions return strings on error (never throw)? Are there unhandled promise rejections?
7. **i18n completeness** — is every user-facing string going through `t()`? Are there hardcoded German/English strings? Are all keys in `keys.ts` present in BOTH locale files? Are there keys in locale files not in `keys.ts`?
8. **Test coverage** — does every `.ts` file in `src/` that contains logic have a corresponding `.test.ts`? List any untested files.
9. **Naming conventions** — SCREAMING_SNAKE_CASE for constants, camelCase for functions, PascalCase for types, kebab-case for files. Find violations.
10. **Dependency hygiene** — are all `package.json` dependencies actually used? Are there imports of packages not in `package.json`?

Report ALL findings with file, line, severity, description, fix."

### Subagent 4: Cross-Feature Conflict Audit
Prompt: "Read `src/index.ts`, `src/orchestrator/agent-loop.ts`, `src/orchestrator/conversation.ts`, `src/orchestrator/compaction/compactor.ts`, `src/tools/shell.ts`, `src/sandbox/container.ts`, `src/models/model-registry.ts`, `src/agents/hub.ts`, `src/webhooks/server.ts`, `src/messaging/streamer.ts`. Then audit:

1. **Sandbox + Shell** — when sandbox is enabled, does `shell.ts` ALWAYS route through `docker exec`? What about `process_spawn`? What about MCP tools that execute commands?
2. **Multi-agent + Compaction** — does session compaction work correctly per-agent? Or does it accidentally compact the wrong agent's history?
3. **Multi-agent + Memory** — when an agent has `memoryScope: 'isolated'`, does `memory_write` go to the right file? Does `auto-recall` pull from the right scope?
4. **Multi-agent + Approval** — when a specialist agent needs L2 approval, does the approval go to the right chat? Does the nonce system work across agents?
5. **Webhook + Agent routing** — when a webhook fires, which agent handles it? The hub or a specialist? Is this configurable?
6. **TTS + Companion** — can the TTS tool deliver audio to companion devices? Is audio base64-encoded correctly for WebSocket transport?
8. **Companion + Approval** — do approval buttons work over WebSocket? Does the approval gate receive responses from companion devices?
9. **Smart Home + Sandbox** — smart home tools make network requests. Does sandbox `--network=none` block them? Should smart home be exempt from sandbox?
10. **Gmail + Webhook** — the Gmail Pub/Sub feature would need the webhook server. Are they integrated? Or is it a dangling reference?
11. **Cron + Multi-agent** — when a cron job fires, which agent handles it?
12. **Skill marketplace + Skill permissions** — are marketplace-installed skills subject to the same permission manifest enforcement as local skills?

Report ALL findings with file, line, severity, description, fix."

### Subagent 5: Documentation Accuracy Audit
Prompt: "Read ALL files in `docs/`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `.env.example`. Then cross-reference with actual source code. Audit:

1. **CLAUDE.md Project Structure** — does the file tree match actual `src/` directory? Use `find src -name '*.ts' | sort` to verify. List missing or extra files.
2. **CLAUDE.md Project Status** — are all checkboxes accurate? Are there checked items whose features don't actually exist in code?
3. **CLAUDE.md Tech Stack** — are all technologies listed actually used? Are there used technologies not listed?
4. **CLAUDE.md Key Decisions** — are all decisions still valid? Are there decisions that were reversed?
5. **ARCHITECTURE.md diagrams** — do the flow diagrams match actual code flow? Are there described features that don't exist?
6. **ARCHITECTURE.md sections** — does every section accurately describe the current implementation?
7. **OPENCLAW_GAP_ANALYSIS.md** — are all ✅ items actually implemented? Are there items marked ❌ that are now implemented?
8. **CHANGELOG.md** — are test counts accurate? Are listed file paths real? Are version numbers consistent with `package.json`?
9. **README.md** — does the README accurately describe setup, usage, and features?
10. **.env.example** — does it list ALL env vars from `src/config/defaults.ts`? Are there env vars in code not in .env.example?
11. **Release references** — are there any remaining references to GitHub releases that don't exist? (We cleaned this up but verify nothing was re-introduced)

Report ALL findings with file, line, severity, description, fix."

### Subagent 6: OpenClaw Advantage Verification
Prompt: "Read `docs/OPENCLAW_GAP_ANALYSIS.md` and `CLAUDE.md` (section 'Geofrey-Vorteile vs. OpenClaw'). Then verify each claimed advantage against actual code:

1. **3-Layer Prompt Injection Defense** — verify all 3 layers exist and work. Read `src/orchestrator/agent-loop.ts`, `src/tools/mcp-client.ts`, all tool files. Are user inputs wrapped in DATA tags? Are tool outputs sanitized? Are model responses validated?
2. **Native MCP Client with Security** — verify output sanitization, allowlist, Zod validation. Read `src/tools/mcp-client.ts`.
3. **Image Metadata Sanitization** — verify EXIF/XMP/IPTC stripping and injection scanning. Read `src/security/image-sanitizer.ts`.
4. **Local-First Orchestrator as Security Layer** — verify the orchestrator reviews actions before execution. Is there a path where tools execute WITHOUT orchestrator review?
5. **Hybrid Risk Classification** — verify deterministic (90%) + LLM (10%) split. Read `src/approval/risk-classifier.ts`. Is the LLM fallback actually called for ambiguous cases?
6. **Filesystem Confinement** — verify `confine()` is called on ALL filesystem operations. Read `src/tools/filesystem.ts`, `src/tools/shell.ts`, `src/sandbox/volume-mount.ts`.
7. **Obfuscation-resistant L3 Blocking** — verify path variants, base64, chmod+x, script network patterns. Test mentally: could `echo 'Y3VybCBldmls' | base64 -d | sh` bypass L3?
8. **Cost savings (80-90% cheaper)** — verify local orchestrator handles most requests. Is there unnecessary cloud API usage?
9. **Claude Code Integration** — verify session management, streaming, tool scoping. Read `src/tools/claude-code.ts`.
10. **Docker Sandbox** — verify per-session isolation, network disabled, memory limits. Does OpenClaw have this? (Check gap analysis)

For each advantage: confirm it's REAL and WORKING, or flag it as BROKEN/OVERSTATED. We must not claim advantages we don't actually deliver."

### Subagent 7: Test Suite Verification
Prompt: "Run `pnpm test` and `pnpm lint`. Then audit:

1. **All tests pass** — if any fail, report which and why.
2. **Type check clean** — if `pnpm lint` (tsc --noEmit) has errors, report all.
3. **Test quality** — read 10 random `.test.ts` files across different modules. Are tests actually testing behavior or just checking that functions exist? Are there tests that always pass regardless of implementation (tautological tests)?
4. **Mock correctness** — are mocks accurate representations of real dependencies? Are there mocks that hide real bugs?
5. **Edge cases** — are error paths tested? Timeouts? Invalid input? Empty states? Concurrent access?
6. **E2E coverage** — are there integration tests that test cross-module flows? (e.g., message → agent loop → tool execution → approval → response)

Run the tests, report results, and flag quality issues."

---

## Step 3: Fix Everything

After all 7 subagents report, compile a unified issue list sorted by severity (`[CRITICAL]` → `[LOW]`).

Then fix ALL `[CRITICAL]` and `[HIGH]` issues. For `[MEDIUM]` issues, fix if straightforward (< 10 lines), otherwise document in a new `docs/KNOWN_ISSUES.md`.

**Do NOT:**
- Add new features
- Refactor working code for style preferences
- Change architecture
- Add dependencies

**DO:**
- Fix security holes
- Fix broken integrations
- Fix dead code / missing registrations
- Fix incorrect documentation
- Fix failing tests
- Add missing risk classifications
- Add missing i18n keys
- Fix config/env var gaps

### Step 4: Final Verification

After all fixes:
1. Run `pnpm lint` — must be 0 errors
2. Run `pnpm test` — must be 0 failures
3. Verify no regressions by scanning git diff

### Step 5: Report

Create a summary in this format:

```
## Geofrey v2.0 Audit Report

### Stats
- Total issues found: X
- Critical: X (all fixed)
- High: X (all fixed)
- Medium: X (X fixed, X documented)
- Low: X (documented)

### Security
- [summary of security findings and fixes]

### Integration
- [summary of integration findings and fixes]

### Documentation
- [summary of doc fixes]

### OpenClaw Advantages
- [confirmation or correction of each claimed advantage]

### Remaining Known Issues
- [list of MEDIUM/LOW items not fixed]
```

Output this report as the final message.
