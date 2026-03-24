---
title: "All hook events and their matchers"
category: "hooks"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/hooks"
last_verified: "2026-03-22"
content_hash: ""
---

# Hook Events Reference

Claude Code hooks fire at specific lifecycle points. Each event optionally supports a **matcher** field that filters when the hook runs. If no matcher is specified, the hook fires for every occurrence of that event.

## Session Lifecycle Events

### SessionStart
Fires when a session begins or resumes.

**Matcher values:** `startup`, `resume`, `clear`, `compact`

```json
{
  "event": "SessionStart",
  "hooks": [
    { "matcher": "startup", "hooks": [{ "type": "command", "command": "echo 'Fresh session'" }] },
    { "matcher": "resume", "hooks": [{ "type": "command", "command": "echo 'Resumed session'" }] }
  ]
}
```

- `startup` — brand new session
- `resume` — continuing a previous session (e.g., `claude --resume`)
- `clear` — session cleared with `/clear`
- `compact` — session restarted after compaction

### SessionEnd
Fires when a session terminates.

**Matcher values:** `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other`

### InstructionsLoaded
Fires when CLAUDE.md or similar instruction files are loaded.

**Matcher values:** `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact`

- `session_start` — instructions loaded at session startup
- `nested_traversal` — instructions found by traversing parent directories
- `path_glob_match` — instructions matched via glob pattern
- `include` — instructions loaded via `@include` directive
- `compact` — instructions reloaded after compaction

## User Input Events

### UserPromptSubmit
Fires when the user submits a prompt. No matcher — fires on every submission.

Useful for logging, input validation, or injecting context.

## Tool Lifecycle Events

### PreToolUse
Fires before a tool executes.

**Matcher:** Tool name regex (e.g., `Bash`, `Read`, `Edit`, `Write`, `mcp__.*`)

```json
{
  "event": "PreToolUse",
  "hooks": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "command": "python3 validate_cmd.py" }] }
  ]
}
```

Exit code 2 blocks the tool call and feeds stderr back to Claude as an error message.

### PostToolUse
Fires after a tool executes successfully.

**Matcher:** Tool name regex

### PostToolUseFailure
Fires after a tool execution fails.

**Matcher:** Tool name regex

### PermissionRequest
Fires when Claude requests permission to use a tool.

**Matcher:** Tool name regex

Can return JSON with `permissionDecision` to auto-allow or auto-deny.

## Response Events

### Stop
Fires after Claude completes a response. **No matcher** — fires on every response.

Useful for post-response validation, logging, or triggering follow-up actions.

### StopFailure
Fires when Claude's response is interrupted by an error.

**Matcher values:** `rate_limit`, `authentication_failed`, `billing_error`, `invalid_request`, `server_error`, `max_output_tokens`, `unknown`

```json
{
  "event": "StopFailure",
  "hooks": [
    { "matcher": "rate_limit", "hooks": [{ "type": "command", "command": "notify-send 'Rate limited'" }] }
  ]
}
```

### Notification
Fires on system notifications.

**Matcher values:** `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`

## Subagent Events

### SubagentStart
Fires when a subagent spawns.

**Matcher:** Agent type (e.g., `Explore`, `code`)

### SubagentStop
Fires when a subagent completes.

**Matcher:** Agent type

## Task Events

### TeammateIdle
Fires when a teammate agent becomes idle. **No matcher.**

### TaskCompleted
Fires when a task finishes. **No matcher.**

## Configuration Events

### ConfigChange
Fires when settings change.

**Matcher values:** `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`

## Worktree Events

### WorktreeCreate
Fires when a git worktree is created. **No matcher.**

### WorktreeRemove
Fires when a git worktree is removed. **No matcher.**

## Compaction Events

### PreCompact
Fires before context compaction.

**Matcher values:** `manual`, `auto`

### PostCompact
Fires after context compaction.

**Matcher values:** `manual`, `auto`

## Elicitation Events

### Elicitation
Fires when an MCP server requests user input.

**Matcher:** MCP server name

### ElicitationResult
Fires when the user responds to an elicitation.

**Matcher:** MCP server name

## Summary Table

| Event | Matcher Type | Example Matcher |
|---|---|---|
| SessionStart | session trigger | `startup`, `resume` |
| SessionEnd | exit reason | `clear`, `logout` |
| InstructionsLoaded | load trigger | `session_start`, `include` |
| UserPromptSubmit | none | — |
| PreToolUse | tool name regex | `Bash`, `Edit` |
| PostToolUse | tool name regex | `Bash`, `Write` |
| PostToolUseFailure | tool name regex | `Bash` |
| PermissionRequest | tool name regex | `Bash` |
| Notification | notification type | `permission_prompt` |
| SubagentStart | agent type | `Explore` |
| SubagentStop | agent type | `Explore` |
| Stop | none | — |
| StopFailure | error type | `rate_limit` |
| TeammateIdle | none | — |
| TaskCompleted | none | — |
| ConfigChange | settings type | `user_settings` |
| WorktreeCreate | none | — |
| WorktreeRemove | none | — |
| PreCompact | trigger type | `manual`, `auto` |
| PostCompact | trigger type | `manual`, `auto` |
| Elicitation | MCP server name | `my-server` |
| ElicitationResult | MCP server name | `my-server` |
| SessionEnd | exit reason | `clear`, `resume` |
