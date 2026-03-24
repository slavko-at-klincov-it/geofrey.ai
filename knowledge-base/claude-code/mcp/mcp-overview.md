---
title: "MCP overview and installation scopes"
category: "mcp"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/mcp"
  - "https://modelcontextprotocol.io/"
last_verified: "2026-03-22"
content_hash: ""
---

# Model Context Protocol (MCP) Overview

MCP is a protocol that lets Claude Code connect to external tools and data sources via servers. MCP servers provide additional tools beyond the built-in ones (Read, Edit, Bash, Grep, Glob, etc.) that Claude can call during a conversation.

## How It Works

1. You configure one or more MCP servers in a JSON config file.
2. When Claude Code starts (or when you restart a session), it connects to those servers.
3. The servers expose tools that Claude can invoke just like built-in tools.
4. Tool calls go through the same permission system as built-in tools.

## Installation Scopes

MCP servers can be configured at four levels, from most specific to broadest:

### 1. Project-level (recommended for team-shared servers)

File: `.mcp.json` in project root.

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"]
    }
  }
}
```

Committed to version control so the whole team gets the same servers.

### 2. Local user (personal servers, not committed)

File: `~/.claude/.mcp.json`

Same format as project-level. Applies to every project you open.

### 3. User settings

File: `~/.claude/settings.json` — use the `mcpServers` field.

```json
{
  "mcpServers": {
    "my-server": { "type": "stdio", "command": "my-tool" }
  }
}
```

### 4. Managed (organization policy)

Set by an organization admin. Users cannot override these. Configured via enterprise policy settings that push MCP server configs to all users in the org.

## Quick Start

The fastest way to add a server:

```bash
# Add interactively
claude mcp add my-server npx -y @example/mcp-server

# Or edit the config file directly
vim .mcp.json
```

After adding a server, start a new Claude Code session (or use `/mcp` to reconnect) to pick up the changes.
