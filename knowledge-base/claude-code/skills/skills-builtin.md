---
title: "Claude Code Bundled Skills Reference"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-25"
content_hash: ""
---

# Bundled Skills

These are **skills** that ship with Claude Code. They look like slash commands but are
prompt-based — Claude expands them into a full prompt and processes the result.

For built-in slash commands (native UI actions like `/clear`, `/model`, `/compact`),
see: `commands/commands-slash-builtin.md`

## Workflow Skills

### `/batch <instruction>`

Orchestrate parallel large-scale changes across the codebase using worktrees.

```
/batch update all React class components to functional components
/batch add JSDoc comments to all exported functions in src/
```

### `/simplify [focus]`

3-agent code review for architecture, duplicates, and performance.

```
/simplify
/simplify error handling
```

### `/debug [description]`

Troubleshoot issues in the current session.

```
/debug tests are failing with timeout errors
/debug build output is missing CSS
```

### `/loop [interval] <prompt>`

Run a prompt repeatedly on a specified interval (default 10m).

```
/loop 5m run tests and report failures
/loop 30s check if the dev server has errors
```

### `/claude-api`

Load Claude API and Agent SDK reference docs. Auto-triggers on `anthropic` imports.

### `/schedule [description]`

Create, update, list, or run scheduled remote agents (cron triggers).

```
/schedule check deploy status every day at 9am
```

### `/security-review`

Security audit of uncommitted changes.

## Key Distinction for geofrey

- Skills CAN be invoked in print mode: `claude -p "/simplify"`
- Built-in commands (like `/clear`) CANNOT be invoked in print mode
- Skills can be disabled with `--disable-slash-commands`
- Check installed skills with `/skills` or `claude plugin list`
