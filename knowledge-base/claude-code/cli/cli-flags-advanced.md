---
title: "Claude Code Advanced Flags"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Advanced Flags

These flags provide specialized capabilities for worktrees, remote sessions, subagents, MCP servers, and debugging.

## Git Worktree

### `--worktree` / `-w`

Start Claude Code in an isolated git worktree. This creates a separate working directory with its own branch, allowing parallel work without conflicts.

```bash
claude -p "implement feature X" --worktree
```

Claude creates a new worktree, does its work there, and the changes are isolated from your main working directory. This is valuable for orchestration — multiple Claude Code instances can work on different tasks simultaneously without stepping on each other's files.

## Additional Working Directories

### `--add-dir <path>`

Add extra directories to Claude's working context. Claude can read and edit files in these directories in addition to the main working directory.

```bash
claude -p "update the API client to match the server" \
  --add-dir /path/to/api-server \
  --add-dir /path/to/shared-types
```

Useful when a task spans multiple repositories or packages.

## Remote Sessions

### `--remote`

Create a web session on claude.ai linked to your local project. Opens the session in a browser.

```bash
claude --remote
```

### `--remote-control` / `--rc`

Enable Remote Control, allowing external systems to send commands to a running Claude Code session.

```bash
claude --remote-control
```

### `--teleport`

Resume an existing web session from claude.ai back into the terminal.

```bash
claude --teleport
```

## Subagents

### `--agents <json>`

Define subagents dynamically via a JSON configuration. Subagents are specialized Claude instances that the main Claude can delegate tasks to.

```bash
claude -p "build the full feature" --agents '[
  {
    "name": "reviewer",
    "model": "opus",
    "system_prompt": "You are a code reviewer. Review code for bugs and style issues."
  },
  {
    "name": "tester",
    "model": "sonnet",
    "system_prompt": "You write comprehensive test suites."
  }
]'
```

### `--agent <name>`

Use a specific subagent as the main agent instead of the default Claude Code agent.

```bash
claude -p "review this code" --agent reviewer --agents '[...]'
```

## Browser and IDE Integration

### `--chrome`

Enable Chrome browser integration, allowing Claude to interact with web pages.

```bash
claude -p "test the login flow in the browser" --chrome
```

### `--ide`

Auto-connect to a running IDE (VS Code, JetBrains, etc.) for enhanced editing capabilities.

```bash
claude --ide
```

## MCP Servers

### `--mcp-config <files>`

Load MCP (Model Context Protocol) server configurations from JSON files. MCP servers extend Claude's capabilities with custom tools.

```bash
claude -p "task" --mcp-config ./mcp-servers.json
```

The JSON file defines MCP servers and their connection details. Multiple config files can be specified:

```bash
claude -p "task" --mcp-config ./mcp-base.json --mcp-config ./mcp-project.json
```

## Settings

### `--settings <file|json>`

Load Claude Code settings from a file or inline JSON string. Overrides default settings for the session.

```bash
# From file
claude -p "task" --settings ./claude-settings.json

# Inline JSON
claude -p "task" --settings '{"model": "sonnet", "permission_mode": "bypassPermissions"}'
```

## Plugins

### `--plugin-dir <path>`

Load plugins from a directory. Plugins can extend Claude Code with custom tools, hooks, and behaviors.

```bash
claude -p "task" --plugin-dir ./my-plugins
```

## Initialization and Maintenance

### `--init`

Run initialization hooks before starting the session. Init hooks are defined in project settings and can set up the environment.

```bash
claude --init
```

### `--init-only`

Run initialization hooks and exit without starting a session.

```bash
claude --init-only
```

### `--maintenance`

Run maintenance hooks and exit. Useful for periodic cleanup tasks defined in project settings.

```bash
claude --maintenance
```

## Debugging

### `--verbose`

Enable verbose logging. Shows detailed information about what Claude Code is doing internally.

```bash
claude --verbose
```

### `--debug <categories>`

Enable debug output with optional category filters. Without categories, enables all debug output.

```bash
# All debug output
claude --debug

# Specific categories
claude --debug "api,tools"
```

## Flags Most Relevant to Orchestration

For Maestro-style orchestration, the most important advanced flags are:

| Flag | Why It Matters |
|------|---------------|
| `--worktree` | Enables parallel task execution without file conflicts |
| `--add-dir` | Lets tasks span multiple repositories |
| `--agents` | Defines specialized subagents for delegation |
| `--mcp-config` | Extends capabilities with custom tools |
| `--settings` | Applies consistent configuration across tasks |
| `--verbose` / `--debug` | Troubleshooting failed tasks |

**Example — parallel orchestration with worktrees:**
```bash
# Task 1: implement feature (isolated worktree)
claude -p "implement user registration" --worktree --name "task-registration" &

# Task 2: implement another feature (isolated worktree)
claude -p "implement password reset" --worktree --name "task-password-reset" &

# Wait for both to complete
wait
```
