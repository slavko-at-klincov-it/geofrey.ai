---
title: "Hook input/output format and JSON control"
category: "hooks"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/hooks"
last_verified: "2026-03-22"
content_hash: ""
---

# Hook Input/Output Format

## Input

All hooks receive a JSON object on **stdin** (for command hooks) or as the **request body** (for HTTP hooks). The structure varies by event but always includes these base fields:

```json
{
  "session_id": "session_abc123",
  "cwd": "/Users/dev/project",
  "hook_event_name": "PreToolUse"
}
```

### Tool-specific fields

For tool lifecycle events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`), the input includes:

```json
{
  "session_id": "session_abc123",
  "cwd": "/Users/dev/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm run build"
  }
}
```

The `tool_input` object varies by tool:

| Tool | tool_input fields |
|---|---|
| Bash | `command` |
| Read | `file_path`, `offset`, `limit` |
| Edit | `file_path`, `old_string`, `new_string` |
| Write | `file_path`, `content` |
| Glob | `pattern`, `path` |
| Grep | `pattern`, `path`, `glob` |
| WebFetch | `url` |

### PostToolUse additional fields

PostToolUse events include the tool's output:

```json
{
  "session_id": "session_abc123",
  "cwd": "/Users/dev/project",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm run build" },
  "tool_output": { "stdout": "Build succeeded", "stderr": "", "exit_code": 0 }
}
```

### StopFailure fields

```json
{
  "session_id": "session_abc123",
  "cwd": "/Users/dev/project",
  "hook_event_name": "StopFailure",
  "error_type": "rate_limit",
  "error_message": "Rate limit exceeded"
}
```

### SessionStart/SessionEnd fields

```json
{
  "session_id": "session_abc123",
  "cwd": "/Users/dev/project",
  "hook_event_name": "SessionStart",
  "trigger": "startup"
}
```

## Output — Exit Code Based

The simplest output mechanism uses exit codes (command hooks) or HTTP status codes (HTTP hooks):

| Exit Code | HTTP Status | Meaning |
|---|---|---|
| 0 | 200 | **Allow** — tool proceeds normally |
| 2 | 403 | **Block** — tool call is blocked; stderr (or response body) is sent to Claude as error feedback |
| Other | Other | **Non-blocking error** — logged but does not prevent execution |

### Blocking with feedback

When a hook blocks (exit 2), stderr is sent to Claude as the error message. This lets you guide Claude to take a different approach:

```bash
#!/bin/bash
echo "Cannot write to .env files. Use .env.example instead and tell the user to set values manually." >&2
exit 2
```

Claude will see this message and adjust its behavior accordingly.

## Output — JSON for Fine-Grained Control

For more control, hooks can output JSON to stdout. The JSON must include a `hookSpecificOutput` object with one or more of these fields:

### permissionDecision

Override the permission prompt result. Only valid for `PermissionRequest` hooks.

```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow",
    "permissionDecisionReason": "Command matches approved CI/CD pattern"
  }
}
```

Values: `allow`, `deny`, `ask`

- `allow` — auto-approve without prompting the user
- `deny` — auto-deny without prompting the user
- `ask` — show the normal permission prompt to the user

### updatedInput

Modify the tool's input before execution. Only valid for `PreToolUse` hooks.

```json
{
  "hookSpecificOutput": {
    "updatedInput": {
      "command": "npm run build -- --no-cache"
    }
  }
}
```

This transparently rewrites what the tool receives. Useful for:
- Adding safety flags to commands
- Rewriting file paths
- Injecting environment variables

### updatedPermissions

Change the permission mode. Valid for `SessionStart` and `ConfigChange` hooks.

```json
{
  "hookSpecificOutput": {
    "updatedPermissions": {
      "allow": ["Bash(npm run *)"],
      "deny": ["Bash(rm *)"]
    }
  }
}
```

## Combining Exit Code and JSON

When a hook outputs JSON to stdout AND exits with code 0, the JSON output takes effect. If the hook exits with code 2, the JSON is ignored and the block behavior applies.

## Reading Input in Scripts

### Bash
```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
```

### Python
```python
#!/usr/bin/env python3
import sys, json
data = json.load(sys.stdin)
tool = data.get("tool_name", "")
tool_input = data.get("tool_input", {})
```

### Node.js
```javascript
#!/usr/bin/env node
let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  const tool = data.tool_name || '';
  const toolInput = data.tool_input || {};
});
```
