---
title: "Checkpointing and rewind"
category: "context"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-usage"
last_verified: "2026-03-22"
content_hash: ""
---

# Checkpointing and Rewind

Rewind your Claude Code session to a previous state — both conversation and file changes — when Claude goes in the wrong direction.

## Opening the Rewind Interface

Press **Esc+Esc** (double escape) or type:

```
/rewind
```

This opens the rewind interface showing all checkpoints in your session.

## Rewind Options

### Full Rewind
Restores both the conversation AND file changes to a specific checkpoint. Everything after that point is erased — as if it never happened.

### Summarize
Keeps all code/file changes but compresses the conversation from that point forward. Useful when context is getting long but the code changes are good.

### File Checkpointing
Revert specific file changes to prior states without rewinding the entire session.

## When to Use Rewind

- Claude went down a wrong path — rewind to before the mistake, give better instructions
- Claude made good progress but context is bloated — summarize to free up space
- You want to try a different approach — rewind and ask Claude to try something else
- A file got corrupted by bad edits — revert just that file

## Example Workflow

1. Ask Claude to "refactor auth module using JWT"
2. Claude makes 15 tool calls and produces a broken result
3. Press **Esc+Esc** to open rewind
4. Select the checkpoint before the refactor started
5. Claude's conversation and all file changes revert to that point
6. Give a more specific prompt: "refactor auth module, keep the existing session middleware, only replace token generation with JWT"

## What Gets Preserved

- **CLAUDE.md** content is preserved across rewind
- **Task list** is preserved across rewind
- **Session metadata** (model, permissions) stays intact

## What Gets Reverted

- **Conversation history** rolls back to the checkpoint
- **File changes** revert to their state at that checkpoint
- **Tool call results** after the checkpoint are discarded

## Limitations

- Works in **interactive mode only** — not available in print mode (`claude -p`)
- Checkpoints are saved automatically at each step — you do not need to create them manually
- Rewind is local to the current session
