---
title: "All settings keys with types and examples"
category: "settings"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Settings Schema Reference

All major settings keys, their types, and usage examples.

## permissions

Controls tool access rules and default mode.

```json
{
  "permissions": {
    "allow": ["Read(*)", "Glob(*)", "Bash(npm run *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Bash(rm -rf *)", "Read(.env*)"],
    "defaultMode": "default"
  }
}
```

**Type:** `{ allow: string[], ask: string[], deny: string[], defaultMode: string }`

`defaultMode` values: `"default"`, `"acceptEdits"`, `"plan"`, `"dontAsk"`, `"bypassPermissions"`

## env

Environment variables injected into Claude's shell sessions.

```json
{
  "env": {
    "NODE_ENV": "development",
    "DATABASE_URL": "postgresql://localhost:5432/dev",
    "EDITOR": "code"
  }
}
```

**Type:** `Record<string, string>`

## hooks

Event-driven hooks for validation, automation, and logging.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash validate.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          { "type": "command", "command": "echo hello" }
        ]
      }
    ]
  }
}
```

**Type:** `Record<EventName, Array<{ matcher?: string, hooks: Array<{ type: string, command?: string, url?: string, prompt?: string, timeout?: number }> }>>`

## model

Default model to use.

```json
{
  "model": "claude-sonnet-4-20250514"
}
```

**Type:** `string`

## availableModels

List of models the user can switch between.

```json
{
  "availableModels": [
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514"
  ]
}
```

**Type:** `string[]`

## effortLevel

Controls how much effort Claude puts into responses. Affects token usage and response quality.

```json
{
  "effortLevel": "high"
}
```

**Type:** `string` — values like `"low"`, `"medium"`, `"high"`

## modelOverrides

Override model for specific use cases (e.g., use a cheaper model for compaction).

```json
{
  "modelOverrides": {
    "compact": "claude-sonnet-4-20250514",
    "subagent": "claude-sonnet-4-20250514"
  }
}
```

**Type:** `Record<string, string>`

## mcpServers

MCP (Model Context Protocol) server configurations.

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "remote-server": {
      "type": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

**Type:** `Record<string, { type: "stdio" | "sse", command?: string, args?: string[], env?: Record<string, string>, url?: string }>`

## additionalDirectories

Extra directories Claude can access beyond the project root.

```json
{
  "additionalDirectories": [
    "/Users/dev/shared-libs",
    "/Users/dev/design-tokens"
  ]
}
```

**Type:** `string[]`

## claudeMdExcludes

Glob patterns for CLAUDE.md files to exclude from loading.

```json
{
  "claudeMdExcludes": [
    "node_modules/**/CLAUDE.md",
    "vendor/**/CLAUDE.md"
  ]
}
```

**Type:** `string[]`

## autoMemoryEnabled

Enable or disable automatic memory (Claude remembers facts across sessions).

```json
{
  "autoMemoryEnabled": true
}
```

**Type:** `boolean`

## autoMemoryDirectory

Directory where auto-memory files are stored.

```json
{
  "autoMemoryDirectory": "~/.claude/memory"
}
```

**Type:** `string`

## enabledPlugins

List of enabled plugin identifiers.

```json
{
  "enabledPlugins": [
    "@anthropic/plugin-git",
    "@company/custom-plugin"
  ]
}
```

**Type:** `string[]`

## extraKnownMarketplaces

Additional plugin marketplace URLs beyond the default.

```json
{
  "extraKnownMarketplaces": [
    "https://plugins.mycompany.com/registry"
  ]
}
```

**Type:** `string[]`

## agent

Configure the main thread to run as a subagent with specific constraints.

```json
{
  "agent": {
    "maxTurns": 50,
    "systemPrompt": "You are a code review assistant."
  }
}
```

**Type:** `object`

## sandbox

OS-level sandboxing configuration. See the dedicated sandbox knowledge chunk for details.

```json
{
  "sandbox": {
    "enabled": true,
    "mode": "auto-allow"
  }
}
```

**Type:** `object`

## language

UI language preference.

```json
{
  "language": "en"
}
```

**Type:** `string`

## voiceEnabled

Enable voice input.

```json
{
  "voiceEnabled": true
}
```

**Type:** `boolean`

## prefersReducedMotion

Reduce animations in the terminal UI.

```json
{
  "prefersReducedMotion": true
}
```

**Type:** `boolean`

## cleanupPeriodDays

Number of days before old session data is cleaned up.

```json
{
  "cleanupPeriodDays": 30
}
```

**Type:** `number`

## plansDirectory

Directory where Claude stores plan files.

```json
{
  "plansDirectory": ".claude/plans"
}
```

**Type:** `string`
