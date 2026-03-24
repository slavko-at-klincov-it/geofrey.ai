---
title: "Claude Code keyboard shortcuts reference"
category: "keyboard"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Keyboard Shortcuts

Complete reference of all keyboard shortcuts in Claude Code.

## General

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Cancel current generation / clear input |
| `Ctrl+D` | Exit Claude Code (EOF) |
| `Ctrl+L` | Clear the screen |
| `Ctrl+O` | Toggle verbose mode (show full tool output) |
| `Ctrl+T` | Toggle task list display |
| `Ctrl+R` | Reverse search through command history |
| `Ctrl+G` | Open input in external editor ($EDITOR) |
| `Ctrl+V` / `Cmd+V` | Paste image from clipboard |
| `Ctrl+B` | Send current task to background |
| `Ctrl+F` | Kill all background agents |
| `Esc Esc` | Rewind conversation / trigger summarize |
| `Shift+Tab` / `Alt+M` | Toggle between permission modes |
| `Alt+P` / `Option+P` | Switch model |
| `Alt+T` / `Option+T` | Toggle extended thinking |

## Text Editing (Readline-style)

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Move cursor to beginning of line |
| `Ctrl+E` | Move cursor to end of line |
| `Ctrl+K` | Delete from cursor to end of line |
| `Ctrl+U` | Delete entire line |
| `Ctrl+W` | Delete word before cursor |
| `Ctrl+Y` | Paste (yank) last deleted text |
| `Alt+Y` | Cycle through paste (yank) ring |
| `Alt+B` | Move cursor back one word |
| `Alt+F` | Move cursor forward one word |
| `Alt+D` | Delete word after cursor |

## Multiline Input

| Shortcut | Context |
|----------|---------|
| `\` + `Enter` | Works everywhere — escapes the newline |
| `Option+Enter` | macOS Terminal.app |
| `Shift+Enter` | iTerm2, WezTerm, Ghostty, Kitty |
| `Ctrl+J` | Line feed — works in most terminals |

## Command History

| Shortcut | Action |
|----------|--------|
| `Up` | Previous command in history |
| `Down` | Next command in history |
| `Ctrl+R` | Reverse incremental search through history |

## Tips

- `Ctrl+O` (verbose mode) is useful for debugging — it shows the full output of tool calls instead of truncated summaries.
- `Esc Esc` (double-escape) rewinds the conversation to before the last assistant turn, letting you re-prompt or undo.
- `Ctrl+G` opens your `$EDITOR` (e.g., vim, nano) for composing long prompts comfortably.
- `Ctrl+B` backgrounds a long-running task so you can start a new conversation. You get notified when it completes.
