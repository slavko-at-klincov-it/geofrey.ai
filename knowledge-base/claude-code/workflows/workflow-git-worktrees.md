---
title: "Parallel sessions with git worktrees"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-usage"
last_verified: "2026-03-22"
content_hash: ""
---

# Git Worktrees for Parallel Sessions

Run multiple Claude Code sessions on the same repo simultaneously without merge conflicts. Each session works in an isolated git worktree with its own branch.

## Basic Usage

```bash
claude --worktree        # or claude -w — auto-named worktree + branch
claude --worktree my-feature   # custom worktree name
```

This creates an isolated copy of the repo at:

```
<repo>/.claude/worktrees/<name>/
```

Each worktree is a real directory with its own branch, so file changes in one session never interfere with another.

## How It Works

1. Claude creates a new git worktree (a lightweight repo clone sharing the same `.git` history)
2. A new branch is created for the worktree
3. Claude works inside the worktree directory
4. If no changes are made, the worktree is auto-cleaned on session exit

## Parallel Bug Fixes Example

Open 3 terminal tabs and run:

```bash
# Tab 1
claude --worktree fix-auth "Fix the authentication timeout bug"

# Tab 2
claude --worktree fix-payments "Fix the payment rounding error"

# Tab 3
claude --worktree fix-ui "Fix the dashboard layout on mobile"
```

All three sessions work simultaneously on isolated branches. No conflicts.

## Merging Results

After each worktree session finishes:

```bash
cd ~/Code/myproject
git merge fix-auth
git merge fix-payments
git merge fix-ui
```

Or create separate PRs from each branch.

## With Subagents

In custom agent frontmatter, use `isolation: worktree` to give each subagent its own worktree automatically.

## With Agent Teams

When using `/team`, each teammate automatically gets its own worktree. This prevents teammates from stepping on each other's file changes.

## Key Points

- Worktrees share git history but have independent working directories
- Much faster than cloning — it reuses the existing `.git` objects
- Safe for parallel writes — each session has its own files
- Auto-cleanup when no changes are made
- Combine with `--max-turns` and `--max-budget-usd` for unattended parallel runs
