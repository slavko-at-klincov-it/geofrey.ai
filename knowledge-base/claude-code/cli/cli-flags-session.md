---
title: "Claude Code Session Management Flags"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Session Management Flags

Claude Code persists conversations as sessions. These flags control how sessions are created, resumed, and identified.

## Flags Reference

### `--continue` / `-c`

Continue the most recent conversation in the current working directory.

```bash
claude --continue
claude -c
claude -c "now add tests for that module"
```

Claude loads the full history of the last session and continues from where it left off. Optionally pass a new query to send immediately.

### `--resume` / `-r`

Resume a specific session by its ID or display name.

```bash
claude --resume abc123-def456
claude -r "auth-refactor"
```

If a display name was set with `--name`, you can resume by that name instead of the UUID.

### `--name` / `-n`

Set a human-readable display name for the session. Makes it easier to find and resume later.

```bash
claude --name "auth-refactor"
claude -p "fix the login bug" --name "login-fix"
```

### `--session-id`

Use a specific UUID as the session ID. Useful for deterministic session management in automation.

```bash
claude -p "task" --session-id "my-unique-id-123"
```

If a session with that ID already exists, it resumes that session. If not, it creates a new one with that ID.

### `--fork-session`

When resuming a session, create a new session ID instead of continuing the original. The conversation history is copied, but new messages go to the forked session.

```bash
claude --resume "auth-refactor" --fork-session
```

This is useful when you want to branch off from an existing conversation without modifying it.

### `--from-pr <number>`

Resume sessions that were linked to a specific GitHub pull request.

```bash
claude --from-pr 42
```

### `--no-session-persistence`

Do not save the session to disk. The conversation exists only for the duration of the process.

```bash
claude -p "one-off question" --no-session-persistence
```

This is the default behavior in print mode (`-p`). Use `--session-id` or `--name` in print mode if you want persistence.

## Session Management for Orchestration

When Maestro orchestrates multiple Claude Code processes, session management is important for:

1. **Tracking work:** Assign a `--name` or `--session-id` to each task so results can be traced.
2. **Resuming failed tasks:** If a task fails or hits a budget limit, use `--resume` to continue.
3. **Branching:** Use `--fork-session` with `--resume` to retry a task from a checkpoint without losing the original attempt.
4. **Ephemeral tasks:** Use `--no-session-persistence` for throwaway queries that don't need history.

**Example — orchestration pattern:**
```bash
# Launch a named task
claude -p "implement user registration" \
  --name "task-user-reg" \
  --session-id "run-001-user-reg" \
  --max-turns 30

# If it needs more work, resume it
claude -p "also add email validation" \
  --resume "run-001-user-reg"

# Fork to try a different approach
claude -p "try a different validation library" \
  --resume "run-001-user-reg" \
  --fork-session
```
