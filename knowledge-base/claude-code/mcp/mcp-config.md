---
title: "MCP configuration and permissions"
category: "mcp"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/mcp"
last_verified: "2026-03-22"
content_hash: ""
---

# MCP Configuration and Permissions

## Configuration File Structure

MCP servers are configured in `.mcp.json` (or `.mcp.yaml`) at the project root or `~/.claude/.mcp.json` for user-global servers.

### JSON format

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
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

### YAML format

```yaml
mcpServers:
  filesystem:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/path/to/allowed/dir"
```

## Permission Matching for MCP Tools

MCP tools follow the same permission system as built-in tools. In `.claude/settings.json` or project settings, use these patterns:

| Pattern | Matches |
|---------|---------|
| `mcp__<server>` | All tools from that server |
| `mcp__<server>__<tool>` | A specific tool from that server |
| `mcp__<server>__.*` | Regex: all tools from that server |

Example in settings:

```json
{
  "permissions": {
    "allow": [
      "mcp__filesystem__read_file",
      "mcp__github__.*"
    ],
    "deny": [
      "mcp__filesystem__write_file"
    ]
  }
}
```

## Settings Keys for MCP Server Control

These keys go in `.claude/settings.json` or project `.claude/settings.json`:

- **`enableAllProjectMcpServers`** — `true` to auto-enable all servers from `.mcp.json` without prompting.
- **`enabledMcpjsonServers`** — Array of server names to enable from `.mcp.json`.
- **`disabledMcpjsonServers`** — Array of server names to disable from `.mcp.json`.
- **`allowedMcpServers`** — Array of server names always allowed (managed settings).
- **`deniedMcpServers`** — Array of server names always denied (managed settings).

## MCP Resources

Reference MCP-provided resources using `@server:resource` syntax in your prompt:

```
Look at @filesystem:/path/to/file.txt and summarize it.
```

The server must expose the resource for this to work.

## MCP Prompts

MCP servers can expose prompt templates that appear as slash commands. If a server named "my-server" exposes a prompt called "analyze", you can use it as a command.

## CLI Flags

```bash
# Use specific MCP config files (can specify multiple)
claude --mcp-config ./custom-mcp.json --mcp-config ./extra-mcp.json

# Strict mode: ONLY use the specified config files, ignore .mcp.json
claude --strict-mcp-config --mcp-config ./only-these-servers.json
```

`--strict-mcp-config` is useful for CI/CD or locked-down environments where you want full control over which servers are available.

## Troubleshooting

- Run `/mcp` inside Claude Code to see connected servers and their status.
- If a server fails to connect, check the command path and that dependencies are installed.
- Use `claude mcp list` to see all configured servers.
- Use `claude mcp remove <name>` to remove a server.
