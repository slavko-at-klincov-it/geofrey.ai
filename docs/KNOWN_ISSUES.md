# Known Issues

Last updated: 2026-02-13 (Post-Phase 4 Implementation)

## MEDIUM

### ~45% Source Files Without Unit Tests
- **Description**: ~55 of ~120 non-test source files lack dedicated tests. Critical untested files include `agent-loop.ts`, `claude-code.ts`, `tool-registry.ts`, tool wrappers (`tools/*.ts`), and newer Phase 3/4 files (`tools/tts.ts`, `tools/companion.ts`, `tools/smart-home.ts`, `tools/gmail.ts`, `tools/calendar.ts`).
- **Impact**: Regression risk. Core agent loop, tool execution paths, and newer integrations are not regression-protected.

## LOW

### Cron Parser Uses AND Semantics for DoW/DoM
- **Files**: `src/automation/cron-parser.ts`
- **Description**: When both day-of-week and day-of-month are set, this parser uses AND logic (both must match). Standard crontab (Vixie cron) uses OR. Documented in code comments.
- **Impact**: Minimal — edge case. Workaround: use two separate cron jobs.

### pendingApprovals DB Table Not Queried
- **Description**: `pendingApprovals` table is defined in `src/db/schema.ts` but approvals use an in-memory store only. Table reserved for future persistence across restarts.
- **Impact**: Minimal — in-memory store works correctly. Data lost on restart is acceptable for current usage.

## Resolved (2026-02-13)

The following issues from the post-Phase 4 audit have been resolved:

| Issue | Resolution |
|-------|-----------|
| Sandbox not wired into tool execution | `shell.ts` routes commands through Docker containers when `sandbox.enabled=true`; falls back to direct `execa` |
| Agent compaction uses raw chatId | `agent-loop.ts` accepts `agentId`, namespaces via `agentChatId()` |
| memoryScope: 'isolated' never enforced | `store.ts` accepts `agentId`, resolves to `data/memory/agents/{id}/` |
| browser:evaluate allows arbitrary JS | Deterministic L2 + network API scan (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`) → L3 |
| Multiple tools lack deterministic risk rules | Added rules for `write_file`, `delete_file`, `git_commit`, `claude_code`, `memory_write`, `cron`, `browser`, `skill` |
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
