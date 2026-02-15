# Known Issues

Last updated: 2026-02-14 (Post-v2.3 Implementation)

## MEDIUM

### ~40% Source Files Without Unit Tests
- **Description**: ~55 of ~130 non-test source files lack dedicated tests. Critical untested files include `agent-loop.ts`, `claude-code.ts`, `tool-registry.ts`, tool wrappers (`tools/*.ts`), and newer Phase 3/4 files (`tools/tts.ts`, `tools/companion.ts`, `tools/smart-home.ts`, `tools/gmail.ts`, `tools/calendar.ts`). Note: all 20 local-ops tools and billing/format.ts have comprehensive tests (47 tests).
- **Impact**: Regression risk. Core agent loop, tool execution paths, and newer integrations are not regression-protected.

## LOW

### Cron Parser Uses AND Semantics for DoW/DoM
- **Files**: `src/automation/cron-parser.ts`
- **Description**: When both day-of-week and day-of-month are set, this parser uses AND logic (both must match). Standard crontab (Vixie cron) uses OR. Documented in code comments.
- **Impact**: Minimal — edge case. Workaround: use two separate cron jobs.

### pendingApprovals DB Table Not Queried
- **Description**: `pendingApprovals` table is defined in `src/db/schema.ts` but approvals use an in-memory store only. Table reserved for future persistence across restarts.
- **Impact**: Minimal — in-memory store works correctly. Data lost on restart is acceptable for current usage.

## Resolved
See git history for previously resolved issues (2026-02-13 audit: sandbox wiring, agent compaction, DB indexes, rate limiting, prompt injection defense, etc.).
