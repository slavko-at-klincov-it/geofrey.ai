---
title: "MCP server transport types"
category: "mcp"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/mcp"
  - "https://modelcontextprotocol.io/docs/concepts/transports"
last_verified: "2026-03-22"
content_hash: ""
---

# MCP Server Transport Types

MCP supports four transport types for connecting to servers. Each has a different use case and configuration shape.

## 1. stdio (Standard I/O)

Runs a local executable. Claude Code spawns the process and communicates over stdin/stdout.

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Best for: Local tools, CLI wrappers, Node.js packages. Most common type.

## 2. http (HTTP endpoint)

Connects to a remote HTTP server that implements the MCP protocol.

```json
{
  "mcpServers": {
    "remote-api": {
      "type": "http",
      "url": "http://localhost:8080"
    }
  }
}
```

Best for: Remote services, shared team servers, cloud-hosted tools.

## 3. sse (Server-Sent Events)

Connects via HTTP with Server-Sent Events for streaming responses.

```json
{
  "mcpServers": {
    "streaming-server": {
      "type": "sse",
      "url": "http://localhost:8080/sse"
    }
  }
}
```

Best for: Servers that need to push updates, long-running operations.

## 4. ws (WebSocket)

Connects via WebSocket for full-duplex communication.

```json
{
  "mcpServers": {
    "realtime-server": {
      "type": "ws",
      "url": "ws://localhost:8080"
    }
  }
}
```

Best for: Real-time bidirectional communication, persistent connections.

## Environment Variable Expansion

All config values support `${VAR_NAME}` syntax for environment variable expansion:

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

This pulls `GITHUB_PERSONAL_ACCESS_TOKEN` from your shell environment at launch time. Useful for keeping secrets out of config files.

## Choosing a Transport

| Type  | Local/Remote | Use case                        |
|-------|-------------|----------------------------------|
| stdio | Local       | CLI tools, npm packages          |
| http  | Either      | REST-style API servers           |
| sse   | Either      | Streaming, long-running tasks    |
| ws    | Either      | Real-time, bidirectional comms   |

Most users will use `stdio` for local tools and `http` for remote services.
