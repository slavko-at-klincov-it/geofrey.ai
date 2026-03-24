---
title: "Context window behavior and compaction"
category: "context"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# Context Window Management

Claude Code has a finite context window. Understanding how it fills and compacts is essential for productive sessions.

## Context Window Basics

The context window holds everything Claude sees: system prompt, CLAUDE.md content, conversation history, tool calls and their outputs, and thinking tokens. As you work, it fills up.

## Auto-Compaction

When the context window reaches approximately 95% capacity, Claude Code automatically triggers compaction:

1. The conversation is summarized, preserving key insights, decisions, and task state
2. Older detailed content is replaced with the summary
3. CLAUDE.md content is re-injected fresh (not summarized)
4. The session continues with a smaller context footprint

You'll see a notification when compaction occurs.

### Custom Compaction Threshold

Override the default 95% trigger:

```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80
```

Set a lower percentage to compact earlier, leaving more room for Claude to work before the next compaction.

## Manual Compaction

Trigger compaction on demand:

```
/compact
```

Useful when you've finished one task and want to free context before starting another.

You can also provide a focus for the summary:

```
/compact focus on the auth refactoring decisions
```

## Checking Context Usage

```
/context
```

Shows current context window usage, remaining capacity, and warnings if you're approaching the limit.

## Auto-Memory (MEMORY.md)

- Located at `.claude/MEMORY.md` or `~/.claude/MEMORY.md`
- The first 200 lines load automatically at the start of each session
- Claude can write to MEMORY.md to persist information across sessions
- Content survives compaction because it's re-loaded, not summarized

## What Survives Compaction

- CLAUDE.md instructions (re-injected fresh)
- Auto-memory content (re-loaded)
- Key decisions and task context (summarized)
- Current working state

## What Gets Compressed

- Detailed file contents Claude read earlier
- Verbose tool outputs
- Exploratory conversation that led to dead ends
- Intermediate reasoning steps

## Example: Long Session Strategy

```
# Start a complex task
> Refactor the payment system to use the strategy pattern

# After the planning phase, compact to free context for implementation
> /compact keep the refactoring plan and file list

# Continue with a clean context focused on execution
> Now implement the changes from the plan
```
