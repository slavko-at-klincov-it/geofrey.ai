# Known Issues

Last updated: 2026-02-13 (Post-Wiring Cleanup)

## MEDIUM

### ~42% Source Files Without Unit Tests
- **Description**: ~40 of ~95 non-test source files lack dedicated tests. Critical untested files include `agent-loop.ts`, `claude-code.ts`, `tool-registry.ts`, and tool files (`tools/*.ts`).
- **Impact**: Regression risk. Core agent loop and tool execution paths are not regression-protected.

### Phase 4 Backend Infrastructure Not Yet Implemented
- **Description**: CLAUDE.md previously listed these Phase 4 features as complete, but the backend source files were never created: TTS (ElevenLabs synthesizer), Companion Apps (WebSocket server, pairing, push notifications), Smart Home Integration (Hue, HomeAssistant, Sonos, discovery), Gmail/Calendar Automation (Google OAuth2, Gmail API, Calendar API). Tool wrappers (`tts.ts`, `companion.ts`, `smart-home.ts`, `gmail.ts`, `calendar.ts`) also don't exist.
- **Impact**: 5 tool types listed in tool registry descriptions are unavailable. CLAUDE.md corrected to reflect actual state.
- **Status**: Multi-Agent Routing and Skill Marketplace ARE complete and wired.

## LOW

### Cron Parser Uses AND Semantics for DoW/DoM
- **Files**: `src/automation/cron-parser.ts`
- **Description**: When both day-of-week and day-of-month are set, this parser uses AND logic (both must match). Standard crontab (Vixie cron) uses OR. Documented in code comments.
- **Impact**: Minimal — edge case. Workaround: use two separate cron jobs.

### pendingApprovals and webhooks DB Tables Not Queried
- **Description**: `pendingApprovals` and `webhooks` tables are defined in `src/db/schema.ts` but approvals and webhooks use in-memory stores only. Tables reserved for future persistence across restarts.
- **Impact**: Minimal — in-memory stores work correctly. Data lost on restart is acceptable for current usage.

## Resolved (2026-02-13)

The following issues from the post-Phase 4 audit have been resolved:

| Issue | Resolution |
|-------|-----------|
| Sandbox not wired into tool execution | `shell.ts` routes commands through Docker containers when `sandbox.enabled=true`; falls back to direct `execa` |
| Agent compaction uses raw chatId | `agent-loop.ts` accepts `agentId`, namespaces via `agentChatId()` |
| memoryScope: 'isolated' never enforced | `store.ts` accepts `agentId`, resolves to `data/memory/agents/{id}/` |
| browser:evaluate allows arbitrary JS | Deterministic L2 + network API scan (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`) → L3 |
| Multiple tools lack deterministic risk rules | Added rules for `write_file`, `delete_file`, `git_commit`, `claude_code`, `memory_write`, `cron`, `browser`, `skill` |
| OpenRouter costs not tracked | Added 6 OpenRouter models to `pricing.ts` DEFAULT_PRICING |
| MCP allowlist not enforced at connection time | Already enforced at `mcp-client.ts:57` (pre-existing) |
| No rate limiting on WebChat REST API | Per-IP rate limiting (30 req/60s) with 429 responses |
| Conversation history unbounded | Hard cap of 200 messages in memory (DB retains full history) |
| Browser sessions not auto-closed | 10-minute idle timeout with `touchSession()` reset |
| 3-layer prompt injection defense gaps | User input wrapped in `<user_input>`, native tool output in `<tool_output>`, MCP in `<mcp_data>` |
| Multi-agent executor ignores agentId | `runAgentLoopStreaming` uses agent-specific system prompt, model, and allowed tools |
| Agent sessions table never queried | `session-manager.ts` upserts to `agentSessions` DB table |
| No DB indexes on hot columns | Added 7 indexes via `drizzle/0006_add_indexes.sql` |
| Approval gate timeout not tested | Test added: verifies promise resolves `false` after timeout |
| ~80 tool strings not using i18n | 28 new i18n keys added; all tool files now use `t()` |
| ~12 unsafe `as` casts | Replaced with `str()`/`num()`/`obj()` type guards and `nested()` helper |
| i18n falls back silently | `console.warn` on missing key fallback |
