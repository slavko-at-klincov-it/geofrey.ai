---
title: "VS Code integration with Claude Code"
category: "ide"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/ide-integrations"
last_verified: "2026-03-22"
content_hash: ""
---

# VS Code Integration

Claude Code integrates directly with Visual Studio Code, providing a GUI-based chat experience alongside your editor.

## Installation

1. Open VS Code.
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X).
3. Search for "Claude Code" in the marketplace.
4. Click Install.

Alternatively, install from the command line:

```bash
code --install-extension anthropic.claude-code
```

## Launching

- Click the **Spark icon** in the VS Code sidebar (Activity Bar).
- Or open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P) and type **"Claude Code"**.

## Connecting from Terminal

You can connect an existing terminal Claude Code session to VS Code:

```bash
claude --ide
```

This enables IDE-aware features like diff views and file navigation.

## Key Features

### File References

Use `@` syntax to reference files and folders from your workspace:

```
@src/index.ts What does this file do?
@components/ Summarize the components in this directory.
```

The referenced files are included as context in your prompt.

### Multichat Tabs

Open multiple chat sessions in separate tabs. Each tab maintains its own conversation history and context.

### Git Integration

- Create commits with generated messages directly from the chat.
- Create and manage pull requests.
- View diffs and staged changes.

### Diff View

When Claude proposes file changes, VS Code shows a side-by-side diff view. You can:
- Review each change before accepting.
- Accept or reject individual edits.
- See exactly what lines will be modified.

### Resume Past Sessions

Previous conversations are saved and can be resumed from the session history.

## Settings

### Sidebar vs Panel Location

By default, Claude Code appears in the sidebar. To move it to the bottom panel:

1. Right-click the Claude Code icon in the Activity Bar.
2. Select "Move to Panel" (or drag the tab to the panel area).

### Configuration

Access Claude Code settings through VS Code Settings (Ctrl+, / Cmd+,) and search for "Claude Code".
