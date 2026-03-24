---
title: "Git Worktree Isolation for Agents"
category: "agents"
source_urls:
  - "https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic"
last_verified: "2026-03-24"
content_hash: ""
---

# Git Worktree Isolation for Agents

The `isolation: "worktree"` parameter on the Agent tool creates a temporary git worktree so the
agent works on an isolated copy of the repository, leaving the main working tree untouched.

## How It Works

Set `isolation: "worktree"` in the Agent tool call:

```
Agent({
  prompt: "Implement feature X...",
  description: "Implement feature X",
  subagent_type: "general-purpose",
  isolation: "worktree",
  run_in_background: true
})
```

The agent receives a freshly created git worktree with its own branch. The system prompt
injected into the agent includes:

> "This is a git worktree — an isolated copy of the repository. Run all commands from this
> directory. Do NOT `cd` to the original repository root."

## Cleanup Behavior

- **No changes made:** The worktree is automatically cleaned up when the agent finishes.
- **Changes made:** The worktree path and branch name are returned in the agent's result. The
  caller can then review, merge, or discard.

## Spawn Modes (CLI Flag)

The CLI `--spawn` flag controls session isolation at the top level:

| Mode | Description |
|---|---|
| `same-dir` | Default. Sessions share the same working directory. |
| `worktree` | Each on-demand session gets its own isolated git worktree. A pre-created session stays in cwd. |
| `session` | Lightweight session isolation without git worktree. |

The `--capacity <N>` flag controls max concurrent sessions in worktree or same-dir mode.
The `--[no-]create-session-in-dir` flag controls whether a session is pre-created in the
current directory (default: on). In worktree mode, this session stays in cwd while on-demand
sessions get isolated worktrees.

## Use Cases for Worktree Isolation

### 1. Parallel Development
Spawn multiple background agents, each in its own worktree, to work on independent tasks
simultaneously. The batch/parallel work pattern in the system prompt requires this:

> "Once the plan is approved, spawn one background agent per work unit using the Agent tool.
> All agents must use `isolation: "worktree"` and `run_in_background: true`. Launch them all
> in a single message block so they run in parallel."

Each work unit should be independently implementable with no shared state between sibling units.

### 2. Risky Experiments
Test destructive or uncertain changes without affecting the main working tree. If the
experiment fails, the worktree is simply discarded.

### 3. Independent Reviews
Launch a code-reviewer agent in a worktree for an independent assessment that does not
interfere with ongoing work in the main tree.

## EnterWorktree / ExitWorktree Tools

Users can also manually enter a worktree via the `EnterWorktree` tool (only when explicitly
requesting "worktree"). This:

- Creates a new git worktree inside `.claude/worktrees/` with a new branch based on HEAD
- Switches the current session into the worktree
- On exit (`ExitWorktree`), offers to keep or remove the worktree
  - `keep`: Worktree directory and branch are preserved; user can return later
  - `remove`: Worktree is deleted; CWD-dependent caches are cleared
  - If a tmux session was attached: killed on `remove`, left running on `keep`

## Requirements

- Must be in a git repository. The system prompt states: "This is not a git repository. The
  command requires a git repo because it spawns agents in isolated git worktrees and creates
  PRs from each."
- Outside a git repository, worktree creation delegates to WorktreeCreate hooks for
  VCS-agnostic isolation (if configured in settings.json).

## Best Practices

- Always pair `isolation: "worktree"` with `run_in_background: true` for parallel work.
- Use `subagent_type: "general-purpose"` for worktree agents unless a more specific type fits.
- Provide complete context in the agent prompt since worktree agents start fresh.
- Design work units to be independently implementable — no shared state with sibling agents.
