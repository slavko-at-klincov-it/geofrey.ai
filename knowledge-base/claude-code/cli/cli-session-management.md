---
title: "Session Management: Naming, Resuming, and Forking Sessions"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Session Management

Claude Code persists conversations as sessions. You can name, resume, fork, and organize sessions for long-running work.

## Naming Sessions

```bash
# Name at launch
claude --name "auth-refactor"
claude -n "debug-payment-flow"

# Rename inside a session
/rename auth-refactor-v2
```

## Resuming Sessions

```bash
# Open the session picker (search, preview, rename)
claude --resume
# or
/resume

# Resume by name or ID
claude -r "auth-refactor"
claude -r abc123-session-id

# Continue the most recent conversation
claude --continue
claude -c

# Resume sessions linked to a GitHub PR
claude --from-pr 42
```

The session picker organizes sessions by git branch, making it easy to find work associated with a specific feature branch.

## Forking Sessions

```bash
claude --fork-session
```

Creates a copy of the current session. Useful for branching off to try an alternative approach without losing the original conversation.

## Session IDs

```bash
# Set a specific session UUID (useful for automation)
claude --session-id "my-unique-id"
```

## Disabling Persistence

```bash
# Don't save this session (useful for automation, one-off queries)
claude --no-session-persistence
```

In print mode (`-p`), sessions are not persisted by default. Use `--session-id` or `--name` to opt into persistence.

## Clearing Context

```bash
/clear
```

Starts a fresh conversation within the same session. Clears the conversation history but keeps CLAUDE.md instructions loaded.

## Practical Workflows

**Name debugging sessions for later:**
```bash
claude -n "debug-memory-leak-march22"
# ... work on the bug ...
# Next day:
claude -r "debug-memory-leak-march22"
```

**Fork to try an alternative:**
```bash
# In a session exploring approach A
claude --fork-session
# Now in a copy — try approach B without losing approach A
```

**Automation with named sessions:**
```bash
claude -p "run linting and fix issues" -n "lint-fix-run-42" --session-id "lint-42"
# Later, inspect what happened:
claude -r "lint-42"
```

## Key Points

- Sessions are organized by git branch in the picker.
- Subagent sessions appear grouped under their parent session.
- Print mode does not persist sessions unless you explicitly name them or provide a session ID.
- `/clear` resets the conversation but keeps CLAUDE.md context.
