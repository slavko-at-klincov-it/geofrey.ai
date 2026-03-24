---
title: "Agent teams for parallel coordinated execution"
category: "agents"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/sub-agents"
last_verified: "2026-03-22"
content_hash: ""
---

# Agent Teams

Agent teams run parallel Claude Code sessions coordinated on a shared task. Multiple teammates work simultaneously, each with their own context window.

## Starting a Team

```
/team
/agent-teams
```

These commands launch a team session where a lead agent breaks the task into subtasks and assigns them to teammates.

## How Teams Work

1. **Lead assigns tasks** — the lead agent analyzes the request and creates subtasks
2. **3-5+ teammates work in parallel** — each gets their own context window
3. **Self-coordination** — teammates communicate directly with each other via a shared task list (unlike subagents which only report to their parent)
4. **Results merge** — outputs are collected and synthesized

View the shared task list at any time with **Ctrl+T**.

## Teammate Modes

Control how teammates run with the `--teammate-mode` flag:

```bash
claude --teammate-mode tmux     # split pane, visual — see all teammates working
claude --teammate-mode in-process  # background, no visual
claude --teammate-mode auto     # let Claude decide (default)
```

- **tmux**: splits your terminal into panes so you can watch each teammate live
- **in-process**: teammates run in the background, results collected silently

## Configuration

Each teammate can have different settings:

- Different model (e.g., Opus for the hardest subtask, Sonnet for simpler ones)
- Different effort levels
- Different tool permissions

## Use Cases

### Large Refactors
"Refactor auth module" → Lead breaks into tasks → 3 teammates work frontend, backend, tests simultaneously.

### Multi-Hypothesis Debugging
Assign the same bug to 3 teammates with different theories:
- Teammate A: "Investigate race condition"
- Teammate B: "Investigate memory leak"
- Teammate C: "Check configuration"

### Parallel Frontend + Backend + Tests
- Teammate A: "Build the React component"
- Teammate B: "Build the API endpoint"
- Teammate C: "Write integration tests for both"

## Trade-offs

- **Higher token cost** — each teammate uses its own context window
- **Massive parallelism** — 3-5x faster for independent subtasks
- **Works best when subtasks are independent** — avoid tasks that depend on each other's output
- **Keep subtask descriptions specific** so teammates don't duplicate work
