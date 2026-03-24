---
title: "Popular MCP servers and installation examples"
category: "mcp"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/mcp"
  - "https://github.com/modelcontextprotocol/servers"
last_verified: "2026-03-22"
content_hash: ""
---

# Popular MCP Servers

## Notable Servers

| Server | Package | Purpose |
|--------|---------|---------|
| **filesystem** | `@modelcontextprotocol/server-filesystem` | Local file access beyond the project directory |
| **github** | `@modelcontextprotocol/server-github` | GitHub API: issues, PRs, repos, code search |
| **gitlab** | `@modelcontextprotocol/server-gitlab` | GitLab integration: MRs, issues, pipelines |
| **slack** | `@modelcontextprotocol/server-slack` | Read/send Slack messages, search channels |
| **postgres** | `@modelcontextprotocol/server-postgres` | Query PostgreSQL databases |
| **sqlite** | `@modelcontextprotocol/server-sqlite` | Query SQLite databases |
| **brave-search** | `@modelcontextprotocol/server-brave-search` | Web search via Brave Search API |
| **puppeteer** | `@modelcontextprotocol/server-puppeteer` | Browser automation, screenshots, scraping |
| **memory** | `@modelcontextprotocol/server-memory` | Persistent memory via knowledge graph |

## Installation Pattern

1. Add the server to `.mcp.json` (project) or `~/.claude/.mcp.json` (global).
2. Restart your Claude Code session or run `/mcp` to reconnect.

### Example: Adding the GitHub MCP Server

**Via CLI:**

```bash
claude mcp add github \
  -e GITHUB_TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}" \
  -- npx -y @modelcontextprotocol/server-github
```

**Via config file (.mcp.json):**

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

Make sure `GITHUB_PERSONAL_ACCESS_TOKEN` is set in your shell environment (e.g., in `~/.zshrc`).

### Example: Adding the Filesystem Server

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/documents"]
    }
  }
}
```

This gives Claude read/write access to `/Users/me/documents` through the filesystem server's tools.

### Example: Adding a Database Server

```json
{
  "mcpServers": {
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "${DATABASE_URL}"
      }
    }
  }
}
```

## Auto-Approving MCP Tools

To avoid repeated permission prompts for trusted servers, add their tools to your allow list in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__github__.*",
      "mcp__filesystem__read_file"
    ]
  }
}
```

## Finding More Servers

- Official registry: https://github.com/modelcontextprotocol/servers
- Community servers are published as npm packages following the `@org/server-name` convention.
- Any tool that implements the MCP protocol can be used as a server.
