---
title: "Claude Code Built-in Slash Commands — Verified Reference"
category: "commands"
source_urls:
  - "claude --help (v2.1.83)"
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-25"
content_hash: ""
---

# Built-in Slash Commands (Interactive Mode)

These commands work ONLY in interactive Claude Code sessions (not with `-p`).
Verified against Claude Code v2.1.83, 2026-03-25.

## Project Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `/init` | — | Auto-generate a CLAUDE.md by analyzing the codebase |
| `/memory` | — | Browse and edit CLAUDE.md files and auto-memory entries |
| `/context` | — | Visualize context window usage (colored grid) |
| `/compact` | — | Compress conversation history to free context space |
| `/clear` | `/reset`, `/new` | Clear conversation history, start fresh |
| `/resume` | `/continue` | Resume a past session (interactive picker) |
| `/fork` | `/branch` | Branch conversation into a new session |
| `/rename` | — | Rename the current session |
| `/add-dir` | — | Add an extra directory to the session context |
| `/copy` | — | Select and copy code blocks to clipboard |
| `/diff` | — | View all file changes in an interactive viewer |
| `/export` | — | Export conversation to file or clipboard |

## Information & Status

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | — | List all available commands and skills |
| `/usage` | — | Check token usage against plan limits |
| `/cost` | — | Show current session cost |
| `/status` | — | Show version, model, account, connectivity |
| `/tasks` | — | List background tasks |
| `/doctor` | — | Run environment diagnostics |
| `/effort` | — | Switch thinking level (low/medium/high/max/auto) |
| `/extra-usage` | — | Enable additional usage capacity |

## Mode & Model Control

| Command | Aliases | Description |
|---------|---------|-------------|
| `/model` | — | Switch between Opus, Sonnet, Haiku |
| `/fast` | — | Toggle Fast Mode (same model, faster output) |
| `/plan` | — | Toggle Plan Mode (read-only planning, no edits) |
| `/vim` | — | Toggle Vim-style editing |
| `/voice` | — | Toggle voice prompting |

## Feature Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `/hooks` | — | Browse and configure lifecycle hooks |
| `/agents` | — | View and manage sub-agents |
| `/permissions` | `/allowed-tools` | View and manage permission rules |
| `/sandbox` | — | Toggle sandbox mode |
| `/config` | `/settings` | Open settings interface |
| `/rewind` | `/checkpoint` | Rewind conversation and/or code changes |
| `/login` | — | Re-authenticate |
| `/logout` | — | Sign out |
| `/skills` | — | Skill management menu |
| `/plugin` | — | Plugin management (install/remove/list) |
| `/reload-plugins` | — | Reload all plugins without restart |

## Environment Settings

| Command | Aliases | Description |
|---------|---------|-------------|
| `/terminal-setup` | — | Set up Shift+Enter keybinding |
| `/keybindings` | — | Open keybindings config |
| `/status-line` | `/statusline` | Set up terminal status line |
| `/theme` | — | Change syntax highlighting theme |
| `/color` | — | Set prompt bar color |
| `/upgrade` | — | Upgrade your Claude plan |

## Integrations & Extensions

| Command | Aliases | Description |
|---------|---------|-------------|
| `/install-github-app` | — | Set up GitHub PR auto-review |
| `/install-slack-app` | — | Install Slack integration |
| `/mcp` | — | Check MCP status and authentication |
| `/rc` | `/remote-control` | Switch to Remote Control (phone/tablet) |
| `/chrome` | — | Configure Claude in Chrome integration |
| `/ide` | — | Manage IDE integrations (VS Code, JetBrains) |
| `/pr-comments` | — | Show PR comments for current branch |
| `/btw` | — | Ask a side question without interrupting current task |
| `/mobile` | `/ios`, `/android` | Show QR code for mobile app |
| `/desktop` | `/app` | Continue in Desktop app |

## Other

| Command | Aliases | Description |
|---------|---------|-------------|
| `/feedback` | `/bug` | Submit feedback or bug report |
| `/release-notes` | — | View full changelog |
| `/passes` | — | Share free week of Claude Code |
| `/privacy-settings` | — | Privacy settings (Pro/Max only) |
| `/stickers` | — | Order Claude Code stickers |
| `/exit` | `/quit` | Exit Claude Code |

## Notes

- Slash commands are interactive-only. They do NOT work with `claude -p`.
- Some commands overlap with CLI flags (e.g., `/model` ↔ `--model`, `/effort` ↔ `--effort`).
- Use `/help` in an active session to see the current authoritative list.
