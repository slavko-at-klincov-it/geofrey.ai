---
title: "Background Tasks and Subagents"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Background Tasks and Subagents

Claude Code can run tasks in the background, letting you continue working in the main thread while long-running operations complete in parallel.

## Sending Tasks to Background

- **Ctrl+B** — send the current task to background mid-execution
- **Auto-background** — Claude automatically backgrounds long-running operations
- **Subagent frontmatter** — skills with `background: true` always run in background

## Managing Background Tasks

| Shortcut   | Action                          |
|------------|----------------------------------|
| Ctrl+T     | View list of background tasks    |
| Ctrl+F     | Kill all background agents       |

Background tasks automatically notify you when they complete. The `TaskOutput` tool retrieves results from finished background agents.

## Permissions

Background agents pre-approve permissions upfront before going to background. This means Claude asks for all necessary permissions before the task detaches, so it can run unattended.

## Disabling Background Tasks

```bash
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

## Use Cases

**Run tests in background while coding:**
```
> Run the full test suite
# Press Ctrl+B to send to background
> Now let's refactor the auth module while tests run
```

**Parallel investigations:**
```
> Research how error handling works in this codebase
# Ctrl+B to background
> Meanwhile, explain the database schema
```

**Background subagent skill:**
A skill with `background: true` in its frontmatter will always launch as a background agent. Useful for monitoring, long research tasks, or test runs that you want to fire-and-forget.

## Key Points

- Background tasks share the same session context but run independently.
- Results appear in the task list (Ctrl+T) and can be pulled into the main conversation via TaskOutput.
- Subagent sessions appear grouped under their parent in the session picker.
