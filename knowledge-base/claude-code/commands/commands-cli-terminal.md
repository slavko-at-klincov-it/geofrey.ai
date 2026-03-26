---
title: "Claude Code CLI Terminal Commands — Verified Reference"
category: "commands"
source_urls:
  - "claude --help (v2.1.83)"
last_verified: "2026-03-25"
content_hash: ""
---

# CLI Terminal Commands

These are `claude` commands run directly in the terminal (NOT slash commands in interactive mode).
Verified from `claude --help` v2.1.83.

## Session Start

| Command | Description |
|---------|-------------|
| `claude` | Start interactive session |
| `claude "question"` | Start with an initial prompt |
| `claude -p "question"` | Non-interactive print mode, then exit |
| `echo "data" \| claude` | Pipe mode — feed stdin as context |
| `echo "data" \| claude -p "analyze"` | Pipe + print mode combined |

## Session Resume

| Command | Description |
|---------|-------------|
| `claude -c` | Continue most recent session |
| `claude -r "ID"` | Resume session by ID |
| `claude -r "search"` | Resume with interactive picker + search |
| `claude --from-pr 123` | Resume session linked to a PR |
| `claude --fork-session -r "ID"` | Fork on resume (new session ID) |

## CLI Subcommands

| Command | Description |
|---------|-------------|
| `claude auth login` | Authenticate |
| `claude auth logout` | Log out |
| `claude auth status` | Show auth status |
| `claude mcp add <name> <url>` | Add an MCP server |
| `claude mcp list` | List configured MCP servers |
| `claude mcp remove <name>` | Remove an MCP server |
| `claude mcp get <name>` | Get MCP server details |
| `claude mcp serve` | Run Claude Code as an MCP server |
| `claude mcp add-from-claude-desktop` | Import MCP servers from Claude Desktop |
| `claude mcp add-json <name> <json>` | Add MCP server from JSON |
| `claude mcp reset-project-choices` | Reset approved/rejected project MCP servers |
| `claude agents` | List configured agents |
| `claude plugin install <name>` | Install a plugin |
| `claude plugin uninstall <name>` | Remove a plugin |
| `claude plugin list` | List installed plugins |
| `claude plugin enable <name>` | Enable a disabled plugin |
| `claude plugin disable <name>` | Disable a plugin |
| `claude plugin update <name>` | Update a plugin |
| `claude plugin marketplace` | Manage marketplaces |
| `claude plugin validate <path>` | Validate a plugin manifest |
| `claude config list` | Display all settings |
| `claude config set <key> <value>` | Update a setting |
| `claude doctor` | Health check for auto-updater |
| `claude update` / `claude upgrade` | Check for updates and install |
| `claude install [target]` | Install native build (stable/latest/version) |
| `claude setup-token` | Set up long-lived auth token |
| `claude auto-mode config` | Print effective auto mode config |
| `claude auto-mode defaults` | Print default auto mode rules |
| `claude auto-mode critique` | Get AI feedback on custom auto mode rules |

## Essential CLI Flags

| Flag | Description |
|------|-------------|
| `-p, --print` | Print mode — non-interactive, exit after response |
| `-c, --continue` | Continue most recent session |
| `-r, --resume [ID]` | Resume session by ID or search |
| `--model <model>` | Set model (opus, sonnet, haiku, or full name) |
| `--effort <level>` | Set effort (low, medium, high, max) |
| `--max-budget-usd <N>` | Maximum dollar spend (print mode only) |
| `--max-turns <N>` | Maximum conversation turns |
| `-w, --worktree [name]` | Create git worktree for session |
| `--add-dir <dirs>` | Additional directories for tool access |
| `--permission-mode <mode>` | Permission mode (default, plan, auto, bypassPermissions, etc.) |
| `--output-format <fmt>` | Output format: text, json, stream-json (print mode only) |
| `--json-schema <schema>` | Structured output with JSON Schema validation |
| `--system-prompt <prompt>` | Override system prompt |
| `--append-system-prompt <prompt>` | Append to default system prompt |
| `--allowed-tools <tools>` | Whitelist specific tools |
| `--disallowed-tools <tools>` | Blacklist specific tools |
| `--mcp-config <files>` | Load MCP config from JSON files |
| `--agents <json>` | Define custom agents as JSON |
| `--agent <name>` | Use specific agent for session |
| `-n, --name <name>` | Set session display name |
| `--session-id <uuid>` | Use specific session UUID |
| `--chrome` / `--no-chrome` | Enable/disable Chrome integration |
| `--ide` | Auto-connect to IDE on startup |
| `--bare` | Minimal mode: skip hooks, LSP, plugins, auto-memory |
| `--verbose` | Override verbose mode |
| `-d, --debug [filter]` | Debug mode with optional category filter |
| `--debug-file <path>` | Write debug logs to file |
| `--fallback-model <model>` | Auto-fallback when default model overloaded |
| `--tmux` | Create tmux session for worktree |
| `--plugin-dir <path>` | Load plugins from directory |
| `--settings <file>` | Load additional settings from file/JSON |
| `--tools <tools>` | Specify available tools ("" to disable all) |
| `--no-session-persistence` | Don't save session to disk |
| `--dangerously-skip-permissions` | Bypass ALL permission checks (sandbox only!) |
| `--disable-slash-commands` | Disable all skills |
| `-v, --version` | Print version |
| `-h, --help` | Print help |

## geofrey-Relevant: Print Mode Command Pattern

```bash
claude -p "<prompt>" \
  --model sonnet \
  --cwd /path/to/project \
  --max-budget-usd 2.00 \
  --permission-mode bypassPermissions \
  --output-format json \
  --append-system-prompt "Follow conventions in CONVENTIONS.md"
```

Note: `--cwd` is implied by running the command from the correct directory.
For geofrey orchestration, use `subprocess.run(["claude", "-p", ...], cwd=project_dir)`.
