---
title: "Customizing Claude Code keybindings"
category: "keyboard"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Customizing Keybindings

Claude Code keybindings are fully customizable via a JSON configuration file.

## Getting Started

Run the `/keybindings` command inside Claude Code to open the config file for editing:

```
/keybindings
```

This opens `~/.claude/keybindings.json` in your editor.

## File Location

```
~/.claude/keybindings.json
```

## Configuration Format

The file contains an array of keybinding objects:

```json
[
  {
    "key": "ctrl+s",
    "command": "chat:submit",
    "context": "Chat"
  },
  {
    "key": "ctrl+shift+c",
    "command": "chat:copy-last-response",
    "context": "Global"
  }
]
```

Each binding has:
- **`key`** — The key combination (e.g., `ctrl+s`, `alt+p`, `shift+enter`).
- **`command`** — The action in `namespace:action` format.
- **`context`** — Where the binding is active.

## Available Contexts

| Context | When it applies |
|---------|----------------|
| `Global` | Always active |
| `Chat` | When in the main chat input |
| `Autocomplete` | When autocomplete menu is open |
| `Settings` | When in settings screens |
| `Confirmation` | When a permission prompt is shown |

## Unbinding a Key

Set the command to `null` to remove a default binding:

```json
[
  {
    "key": "ctrl+l",
    "command": null,
    "context": "Global"
  }
]
```

This disables `Ctrl+L` (clear screen) globally.

## Chord Bindings (Key Sequences)

You can define multi-key sequences where you press keys in order:

```json
[
  {
    "key": "ctrl+k ctrl+c",
    "command": "chat:copy-last-codeblock",
    "context": "Chat"
  }
]
```

Press `Ctrl+K` then `Ctrl+C` in sequence to trigger the action.

## Examples

### Rebind submit to Ctrl+S

```json
[
  {
    "key": "ctrl+s",
    "command": "chat:submit",
    "context": "Chat"
  }
]
```

### Add a chord shortcut for toggling verbose

```json
[
  {
    "key": "ctrl+k ctrl+v",
    "command": "global:toggle-verbose",
    "context": "Global"
  }
]
```

### Disable Ctrl+D exit

```json
[
  {
    "key": "ctrl+d",
    "command": null,
    "context": "Global"
  }
]
```

## Notes

- Changes apply immediately without restarting Claude Code.
- Custom bindings override defaults — if you bind `ctrl+l` to something else, the default clear-screen behavior is replaced.
- Use `/keybindings` anytime to re-open the file for editing.
