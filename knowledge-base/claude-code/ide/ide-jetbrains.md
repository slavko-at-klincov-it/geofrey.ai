---
title: "JetBrains IDE integration with Claude Code"
category: "ide"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/ide-integrations"
last_verified: "2026-03-22"
content_hash: ""
---

# JetBrains Integration

Claude Code integrates with JetBrains IDEs, providing chat-based assistance within your development environment.

## Supported IDEs

- IntelliJ IDEA
- WebStorm
- GoLand
- CLion
- PyCharm
- Rider
- PhpStorm
- RubyMine
- DataGrip
- Any other JetBrains IDE based on the IntelliJ platform

## Installation

### From the Marketplace

1. Open your JetBrains IDE.
2. Go to **Settings/Preferences > Plugins > Marketplace**.
3. Search for "Claude Code".
4. Click **Install** and restart the IDE.

### Manual Installation

1. Download the plugin `.zip` from the JetBrains Marketplace website.
2. Go to **Settings/Preferences > Plugins > Gear icon > Install Plugin from Disk**.
3. Select the downloaded file.

## Connecting from Terminal

Connect a terminal Claude Code session to your JetBrains IDE:

```bash
claude --ide
```

This enables IDE-aware features like diff views and file navigation within the JetBrains editor.

## Key Features

### Terminal Integration

Claude Code runs inside the JetBrains integrated terminal, with full access to the IDE's project context.

### IDE Detection

Claude Code automatically detects that it's running inside a JetBrains IDE and adapts its behavior (e.g., opening files in the editor instead of printing paths).

### File References

Use `@` syntax to reference project files:

```
@src/main/java/App.java Explain this class.
@build.gradle What dependencies are configured?
```

### Diff View

When Claude proposes changes, the JetBrains diff viewer shows a side-by-side comparison. You can review, accept, or reject each change.

## Configuration

### IDE Path

If Claude Code cannot auto-detect your IDE, set the path explicitly:

```bash
export CLAUDE_IDE_PATH="/Applications/IntelliJ IDEA.app"
```

### ESC Key Behavior

The ESC key behavior can be configured to avoid conflicts with the IDE's own ESC handling (e.g., closing dialogs vs. interacting with Claude). Check the plugin settings under **Settings/Preferences > Tools > Claude Code**.

## WSL Support

For Windows users running JetBrains IDEs with WSL (Windows Subsystem for Linux):

- Claude Code can run inside WSL while the IDE runs on Windows.
- The plugin bridges the connection between the Windows IDE and the WSL-based Claude Code process.
- File paths are automatically translated between Windows and WSL formats.

## Tips

- Use the same `@` file reference syntax as in VS Code for consistent workflows across IDEs.
- The diff view integrates with JetBrains' native diff tooling, so all your familiar diff navigation shortcuts work.
- Multiple chat sessions can run in parallel in different terminal tabs.
