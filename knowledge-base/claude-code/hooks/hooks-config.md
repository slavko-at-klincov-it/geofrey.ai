---
title: "Hook configuration locations, precedence, and settings keys"
category: "hooks"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/hooks"
last_verified: "2026-03-22"
content_hash: ""
---

# Hook Configuration

## Where Hooks Are Configured

Hooks can be defined in multiple settings files. **Precedence from highest to lowest:**

1. **Managed policy settings** — `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS) or `/etc/claude-code/managed-settings.json` (Linux). Cannot be overridden. Intended for enterprise enforcement.

2. **Plugin hooks** — `hooks/hooks.json` within a plugin directory. Loaded when plugins are enabled.

3. **Project local settings** — `.claude/settings.local.json` in the project root. Personal, gitignored. Overrides shared project settings.

4. **Project shared settings** — `.claude/settings.json` in the project root. Committed to git, shared with team.

5. **User global settings** — `~/.claude/settings.json`. Applies to all projects for this user.

Hooks from higher-precedence sources run first. A block from any source stops execution.

## Settings Keys

### hooks

The main configuration key. Maps event names to arrays of matcher/hook pairs.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash /scripts/validate.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          { "type": "command", "command": "echo 'hello'" }
        ]
      }
    ]
  }
}
```

### disableAllHooks

Boolean. When `true`, disables all hooks regardless of where they are defined. Useful for debugging.

```json
{
  "disableAllHooks": true
}
```

### allowManagedHooksOnly

Boolean. When `true` (typically set in managed policy), only hooks defined in the managed settings file are allowed to run. Hooks from user or project settings are ignored.

```json
{
  "allowManagedHooksOnly": true
}
```

### allowedHttpHookUrls

Array of URL patterns. HTTP hooks can only POST to URLs matching one of these patterns. Required for HTTP hooks to function.

```json
{
  "allowedHttpHookUrls": [
    "http://localhost:8080/*",
    "https://hooks.mycompany.com/*"
  ]
}
```

### httpHookAllowedEnvVars

Array of environment variable names that are included in the context sent to HTTP hooks. By default, no environment variables are exposed.

```json
{
  "httpHookAllowedEnvVars": [
    "NODE_ENV",
    "CI",
    "GITHUB_ACTIONS"
  ]
}
```

## Timeout Configuration

Each hook can specify a `timeout` field in **seconds**. If the hook does not complete within the timeout, it is killed and treated as a non-blocking error (not a block).

```json
{
  "type": "command",
  "command": "python3 expensive_check.py",
  "timeout": 30
}
```

**Default timeout:** 600 seconds (10 minutes).

Set shorter timeouts for hooks that run on every tool call (like `PreToolUse`) to avoid slowing down the session.

## Complete Example

A full `~/.claude/settings.json` with hooks:

```json
{
  "permissions": {
    "allow": ["Read(*)", "Glob(*)", "Grep(*)"],
    "deny": ["Bash(rm -rf *)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/block-dangerous.sh",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/block-secrets.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/auto-approve.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/reinject-context.sh"
          }
        ]
      }
    ]
  },
  "allowedHttpHookUrls": [],
  "disableAllHooks": false
}
```

## Debugging Hooks

- Check `/tmp/claude-*.log` or custom log files for hook output
- Use `disableAllHooks: true` temporarily to isolate hook-related issues
- Test hooks standalone: `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | bash your-hook.sh`
- Non-zero exit codes (other than 2) are logged but do not block, making them useful for soft monitoring
