---
title: "MCP Registry, Plugins, and Deferred Tool Loading"
category: "mcp"
source_urls:
  - "https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic"
last_verified: "2026-03-24"
content_hash: ""
---

# MCP Registry, Plugins, and Deferred Tool Loading

Claude Code uses the Model Context Protocol (MCP) to connect to external tool servers, and a
deferred tool loading system to keep the prompt lightweight until specific tools are needed.

## MCP Server Resources

Claude Code provides two built-in tools for interacting with MCP server resources:

### listMcpResources
Lists available resources from configured MCP servers. Each resource object includes a `server`
field indicating which server it comes from.

```
listMcpResources()                          // all servers
listMcpResources({ server: "myserver" })    // specific server
```

### readMcpResource
Reads a specific resource from an MCP server by server name and URI.

```
readMcpResource({ server: "myserver", uri: "my-resource-uri" })
```

## MCP Tool Naming Convention

MCP tools follow the naming pattern `mcp__<server-name>__<tool-name>`. For example:
- `mcp__claude-in-chrome__tabs_context_mcp`
- `mcp__claude-in-chrome__javascript_tool`
- `mcp__playwright__navigate`

## Deferred Tool Loading (ToolSearch)

Not all tools are loaded into the prompt at session start. Tools from MCP servers and optional
built-in tools appear as deferred — listed by name only in `<system-reminder>` messages
(specifically inside `<available-deferred-tools>` blocks). Until fetched, there is no parameter
schema and the tool cannot be invoked.

### The ToolSearch Tool

ToolSearch fetches full schema definitions for deferred tools so they can be called.

**How it works:**
1. Deferred tools appear by name in `<available-deferred-tools>` messages
2. Call `ToolSearch` with a query to find and fetch the tool's complete JSONSchema definition
3. The result contains `<function>` blocks with the full schema — identical format to the tool
   definitions at the top of the prompt
4. Once fetched, the tool is callable exactly like any built-in tool

**Query forms:**

| Form | Example | Behavior |
|---|---|---|
| Exact select | `"select:Read,Edit,Grep"` | Fetch these exact tools by name |
| Keyword search | `"notebook jupyter"` | Keyword search, up to `max_results` best matches |
| Name filter + rank | `"+slack send"` | Require "slack" in the name, rank by remaining terms |

**Parameters:**
- `query` (required): The search query string
- `max_results` (optional, default 5): Maximum number of results to return

### Loading MCP Tools Before Use

The system prompt is explicit: before calling any MCP tool, you MUST first load it via
ToolSearch:

```
// Step 1: Load the tool schema
ToolSearch({ query: "select:mcp__claude-in-chrome__tabs_context_mcp" })

// Step 2: Now call the tool
mcp__claude-in-chrome__tabs_context_mcp()
```

This is critical for browser automation tools (`mcp__claude-in-chrome__*`) and any other
MCP-provided tools.

### Deferred Tool Lifecycle

Tools can become available or unavailable during a session:

- **New tools available:** System reminder says "The following deferred tools are now available
  via ToolSearch:" followed by tool names.
- **Tools disconnected:** System reminder says "The following deferred tools are no longer
  available (their MCP server disconnected). Do not search for them — ToolSearch will return
  no match:" followed by tool names.

## Plugin System

Built-in plugins cannot be updated or uninstalled. They are part of the Claude Code
installation and provide core functionality.

The system prompt instructs Claude Code to check its ACTUAL available tools rather than
assuming from the prompt text:

> "Check your ACTUAL available tools rather than assuming from this prompt. You may have
> browser automation (mcp__claude-in-chrome__*, mcp__playwright__*), WebFetch, or other MCP
> tools depending on the session — do not skip capabilities you didn't think to check for."

## MCP Output Truncation

When MCP tool output is truncated, the system prompt advises:
- If the MCP server provides pagination or filtering tools, use them to retrieve specific
  portions of the data
- If pagination is not available, inform the user that you are working with truncated output
  and results may be incomplete

## WebFetch and MCP Interaction

WebFetch will fail for authenticated or private URLs. Before using WebFetch, check if the URL
points to an authenticated service (e.g., Google Docs, Confluence, Jira, GitHub). If so, use
ToolSearch first to find a specialized MCP tool that provides authenticated access.

## SDK Integration

The Claude Agent SDK supports an `mcp_servers` parameter on API calls that lets Claude connect
directly to remote MCP servers. Local MCP servers, prompts, resources, and more fine-grained
control are available through the `create_sdk_mcp_server` helper and `ClaudeSDKClient`.
