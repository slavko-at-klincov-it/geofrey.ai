---
title: "Cheat Sheet Verification — Charlie Hills 'Every Claude Code Command' (March 2026)"
category: "commands"
source_urls:
  - "Verified against claude --help v2.1.83"
last_verified: "2026-03-25"
content_hash: ""
---

# Cheat Sheet Verification

Source: Charlie Hills "Every Claude Code Command — The Complete Reference | 93 Commands | March 2026"

## Commands That DO NOT EXIST

| # | Claimed Command | Status |
|---|----------------|--------|
| 26 | `/output-style` | **Does not exist.** No such slash command or skill. |
| 49 | `/find-skills` | **Does not exist.** Use `/skills` or `claude plugin list` instead. |

## Commands That Are Misclassified

These are listed as built-in commands but are actually **bundled skills** (prompt-based, not native):

| # | Command | Actually |
|---|---------|----------|
| 19 | `/debug` | Bundled skill, not a built-in command |
| 53 | `/loop` | Bundled skill, not a built-in command |
| 54 | `/simplify` | Bundled skill, not a built-in command |
| 55 | `/batch` | Bundled skill, not a built-in command |
| 47 | `/security-review` | Bundled skill, not a built-in command |

## Commands With Inaccurate Descriptions

| # | Command | Claimed | Correct |
|---|---------|---------|---------|
| 7 | `/fork` | "Branch conversation into a new session" | Correct, but primary name is `/branch`, `/fork` is the alias |
| 18 | `/stats` | "Generate usage statistics as HTML report" | Unverified — may exist but not in `--help` output |
| 23 | `/fast` | "Opus 4.6 at 2.5x speed" | Fast mode uses the same model with faster output, not "2.5x" |
| 38 | `/status-line` | "Set up terminal status line" | Works, but official name is `/statusline` (no hyphen) |
| 42 | `/plugin` | "Plugin management (add/remove/marketplace)" | Correct as slash command AND as CLI subcommand `claude plugin` |
| 45 | `/review` | "Code review for a specified PR" | Was built-in, now requires plugin installation |

## Commands Missing From the Cheat Sheet

These real commands are NOT listed:

| Command | Description |
|---------|-------------|
| `/status` | Show version, model, account, connectivity |
| `/color` | Set prompt bar color |
| `/exit` / `/quit` | Exit Claude Code |
| `/feedback` / `/bug` | Submit feedback |
| `/release-notes` | View full changelog |
| `/reload-plugins` | Reload plugins without restart |
| `/install-slack-app` | Install Slack integration |
| `/mobile` / `/ios` / `/android` | Show QR code for mobile app |
| `/desktop` / `/app` | Continue in Desktop app |
| `/passes` | Share free week of Claude Code |
| `/privacy-settings` | Privacy settings (Pro/Max only) |
| `/stickers` | Order Claude Code stickers |
| `/schedule` | Create/manage scheduled remote agents |
| `/claude-api` | Load Claude API reference (bundled skill) |

## CLI Subcommands Missing From the Cheat Sheet

| Command | Description |
|---------|-------------|
| `claude install [target]` | Install native build |
| `claude setup-token` | Set up long-lived auth token |
| `claude auto-mode config\|defaults\|critique` | Inspect auto mode classifier |
| `claude mcp serve` | Run Claude Code as MCP server |
| `claude mcp add-from-claude-desktop` | Import from Claude Desktop |
| `claude mcp add-json` | Add MCP server from JSON |
| `claude mcp reset-project-choices` | Reset approved/rejected project MCP servers |
| `claude plugin marketplace` | Manage marketplaces |
| `claude plugin validate <path>` | Validate plugin manifest |
| `claude plugin enable/disable` | Enable/disable plugins |

## CLI Flags Missing From the Cheat Sheet

| Flag | Description |
|------|-------------|
| `--bare` | Minimal mode — skip hooks, LSP, plugins, auto-memory |
| `--effort <level>` | Set effort level at launch |
| `--fallback-model` | Auto-fallback when model overloaded |
| `--tmux` | Create tmux session for worktree |
| `--tools` | Specify available tools |
| `--no-session-persistence` | Don't save session |
| `--plugin-dir` | Load plugins from directory |
| `--settings` | Load settings from file/JSON |
| `--debug-file` | Write debug logs to file |
| `--json-schema` | Structured output validation |
| `--input-format` | Input format (stream-json) |
| `--brief` | Enable SendUserMessage tool |
| `--fork-session` | Fork on resume |
| `--disable-slash-commands` | Disable all skills |

## Shortcuts Missing From the Cheat Sheet

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Cancel generation / clear input |
| `Ctrl+D` | Exit (EOF) |
| `Ctrl+L` | Clear screen |
| `Ctrl+O` | Toggle verbose mode |
| `Ctrl+T` | Toggle task list display |
| `Ctrl+G` | Open $EDITOR for input |
| `Ctrl+B` | Send current task to background |
| `Alt+P` / `Option+P` | Switch model |
| `Alt+T` / `Option+T` | Toggle extended thinking |

## Overall Assessment

- **~75% accurate** for slash commands
- **Mixes 4 different categories** without clear distinction (slash commands, skills, CLI commands, shortcuts)
- **2 commands don't exist** (/output-style, /find-skills)
- **5 commands misclassified** as built-in (are skills)
- **~15 real commands missing**
- **~14 CLI flags missing**
- **~9 keyboard shortcuts missing**
- Not reliable as a single source of truth for geofrey's Knowledge Base
