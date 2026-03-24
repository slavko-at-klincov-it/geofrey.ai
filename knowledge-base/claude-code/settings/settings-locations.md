---
title: "Settings file locations and precedence"
category: "settings"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Settings File Locations

Claude Code reads settings from 4 locations, each serving a different scope.

## 1. User Settings

**Path:** `~/.claude/settings.json`

Applies to all projects for the current user. Personal preferences, global permission rules, and default hooks.

```json
{
  "permissions": {
    "allow": ["Read(*)", "Glob(*)", "Grep(*)"],
    "deny": ["Read(.env*)", "Read(~/.ssh/*)"]
  },
  "env": {
    "EDITOR": "code"
  },
  "model": "claude-sonnet-4-20250514"
}
```

## 2. Project Shared Settings

**Path:** `.claude/settings.json` (in the project root)

Committed to version control. Shared with the entire team. Defines project-specific permissions, hooks, MCP servers, and tool configuration.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git diff *)"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/validate.sh" }
        ]
      }
    ]
  },
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

## 3. Project Local Settings

**Path:** `.claude/settings.local.json` (in the project root)

Gitignored. Personal overrides for a specific project. Useful for developer-specific environment variables, local MCP servers, or personal permission tweaks.

```json
{
  "permissions": {
    "allow": ["Bash(docker *)"]
  },
  "env": {
    "DATABASE_URL": "postgresql://localhost:5432/dev"
  }
}
```

## 4. Managed Settings

**Path (macOS):** `/Library/Application Support/ClaudeCode/managed-settings.json`
**Path (Linux):** `/etc/claude-code/managed-settings.json`

System-wide, administrator-managed settings. Cannot be overridden by any other settings source. Intended for enterprise security policies.

```json
{
  "permissions": {
    "deny": ["Bash(curl *)", "Bash(wget *)"],
    "defaultMode": "default"
  },
  "allowManagedHooksOnly": true,
  "disableAllHooks": false
}
```

Requires root/admin privileges to create or modify.

## Precedence Order

**Highest to lowest priority:**

1. **Managed settings** — cannot be overridden
2. **CLI flags** — `--permission-mode`, `--allowedTools`, `--disallowedTools`, `--model`, etc.
3. **Project local settings** — `.claude/settings.local.json`
4. **Project shared settings** — `.claude/settings.json`
5. **User settings** — `~/.claude/settings.json`
6. **Defaults** — built-in Claude Code defaults

### Merge behavior

- **Deny rules:** merged across all sources. Any deny from any source blocks the tool.
- **Allow rules:** merged across all sources.
- **Scalar values** (model, defaultMode, etc.): highest-precedence source wins.
- **Objects** (env, mcpServers, hooks): deep-merged, with higher-precedence keys overriding lower ones.

## Quick Reference

| Scope | Path | Shared? | Override by project? |
|---|---|---|---|
| Managed | `/Library/.../managed-settings.json` | System-wide | No |
| User | `~/.claude/settings.json` | All projects | Yes |
| Project shared | `.claude/settings.json` | Team (git) | Yes |
| Project local | `.claude/settings.local.json` | Personal | N/A (highest project) |
