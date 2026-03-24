---
title: "Built-in Claude Code Skills and Commands"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Built-in Skills and Commands

Claude Code ships with several built-in skills and commands available in every session.

## Workflow Skills

### `/batch <instruction>`

Orchestrate parallel large-scale changes across the codebase. Claude splits the work into independent tasks and runs them concurrently.

```
/batch update all React class components to functional components
/batch add JSDoc comments to all exported functions in src/
```

### `/simplify [focus]`

Review recent code changes for quality, reuse, efficiency, and potential issues. Optionally focus on a specific area.

```
/simplify
/simplify error handling
```

### `/debug [description]`

Troubleshoot issues in the current session. Useful when something isn't working as expected.

```
/debug tests are failing with timeout errors
/debug build output is missing CSS
```

### `/loop [interval] <prompt>`

Run a prompt repeatedly on a specified interval. Useful for watch-mode workflows.

```
/loop 5m run tests and report failures
/loop 30s check if the dev server has errors
/loop 2h pull latest changes and summarize new commits
```

### `/claude-api`

Load Claude API and Agent SDK reference documentation. Auto-triggers when Claude detects `anthropic` imports in your code.

## Project Setup

### `/init`

Initialize a `CLAUDE.md` file by analyzing the codebase structure, build tools, conventions, and dependencies.

### `/memory`

Browse and edit `CLAUDE.md` files and auto-memory entries.

## Session Management

### `/config`

Open the settings interface to configure Claude Code behavior.

### `/permissions`

View and manage permission rules (allow/deny for tools, file paths, commands).

### `/hooks`

Browse configured lifecycle hooks.

### `/model`

Switch the active model (e.g., between Opus, Sonnet, Haiku).

### `/effort`

Set the reasoning effort level (low, medium, high, max).

### `/compact`

Compress conversation history to free up context window space. Useful in long sessions.

### `/context`

Check current context window usage — how much space is used and remaining.

### `/cost`

View the cost of the current session.

### `/status`

Show authentication and account status.

### `/help`

List all available commands and skills.

### `/reload-plugins`

Reload all plugins and skills without restarting the session.
