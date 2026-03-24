---
title: "Hook types: command, http, prompt, agent"
category: "hooks"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/hooks"
last_verified: "2026-03-22"
content_hash: ""
---

# Hook Types

There are 4 hook types. Each receives the same input (JSON describing the event) but differs in how it processes and responds.

## 1. command

Runs a shell command. The event JSON is passed via **stdin**. The exit code determines the outcome.

- **Exit 0** — allow (tool proceeds)
- **Exit 2** — block (stderr is shown to Claude as an error message)
- **Any other exit** — non-blocking error (logged but does not block)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/validate.py"
          }
        ]
      }
    ]
  }
}
```

The command receives JSON on stdin like:
```json
{
  "session_id": "abc123",
  "cwd": "/home/user/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /tmp/cache" }
}
```

Bash example that blocks dangerous commands:
```bash
#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
if echo "$CMD" | grep -qE 'rm\s+-rf\s+/[^t]'; then
  echo "Blocked: destructive rm -rf outside /tmp" >&2
  exit 2
fi
exit 0
```

## 2. http

Sends a POST request to an HTTP endpoint. Same input/output semantics as `command` hooks.

The endpoint receives the event JSON as the request body and must return:
- **HTTP 200** — allow
- **HTTP 403** — block (response body shown to Claude)
- **Other codes** — non-blocking error

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hook/validate"
          }
        ]
      }
    ]
  }
}
```

HTTP hooks require the URL to be listed in `allowedHttpHookUrls` in settings. Environment variables can be exposed to HTTP hooks via `httpHookAllowedEnvVars`.

## 3. prompt

A single-turn Claude evaluation. Good for simple yes/no decisions that benefit from natural language reasoning.

The prompt hook evaluates the event context and returns allow or block. It does NOT have tool access — it performs a single inference call.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Is this command safe to run in a development environment? Block any command that could delete important files, modify system configuration, or access production resources. Allow standard development commands."
          }
        ]
      }
    ]
  }
}
```

Use prompt hooks when:
- The decision requires understanding intent, not just pattern matching
- You want natural language reasoning about safety
- The check is simple enough for a single evaluation

## 4. agent

A multi-turn subagent with tool access. Use for complex verification that needs to inspect files, run commands, or perform multi-step checks.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "agent",
            "prompt": "Check if the file being edited has a corresponding test file. If there is no test file, block the edit and explain that tests must be written first."
          }
        ]
      }
    ]
  }
}
```

Use agent hooks when:
- The check requires reading files (e.g., verifying test coverage)
- Multiple steps are needed (e.g., check lint, then check types)
- The decision depends on project context that must be fetched

## Configuration in settings.json

A complete example combining multiple hook types:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash /scripts/block-dangerous.sh" },
          { "type": "prompt", "prompt": "Is this command safe for development?" }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          { "type": "agent", "prompt": "Verify the edit follows project conventions." }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          { "type": "command", "command": "echo 'Session started' >> /tmp/claude.log" }
        ]
      }
    ]
  }
}
```

Multiple hooks on the same event run sequentially. If any hook blocks (exit 2 / HTTP 403), the tool call is blocked and subsequent hooks for that event do not run.

## Timeout

Each hook can specify a `timeout` field (in seconds). Default timeout is 10 minutes (600 seconds).

```json
{
  "type": "command",
  "command": "python3 slow_check.py",
  "timeout": 30
}
```
