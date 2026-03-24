---
title: "Cost Tracking and Budget Management"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Cost Tracking and Budget Management

Claude Code provides real-time cost visibility and budget controls to prevent runaway spending.

## Viewing Costs

```bash
# Inside a session
/cost
```

Shows: current session cost, token usage breakdown, cost per model used.

The status line at the bottom of the terminal displays real-time cost. Configure what it shows with `/statusline`.

## Budget Controls

| Flag / Setting               | Purpose                                      |
|------------------------------|----------------------------------------------|
| `--max-budget-usd <amount>`  | Cap total spending for a session (print mode) |
| `--max-turns <n>`            | Limit number of agentic turns                 |
| `DISABLE_COST_WARNINGS=1`    | Suppress cost warning messages                |

## Example — Budget-Limited Automation

```bash
claude -p "refactor the utils module" \
  --max-budget-usd 1.50 \
  --max-turns 30
```

Claude stops automatically when either limit is reached.

## Cost Optimization Strategies

**Choose the right model for the task:**
- `haiku` — simple questions, quick lookups, trivial edits (~cheapest)
- `sonnet` — standard coding tasks, most daily work (default)
- `opus` — complex reasoning, architecture decisions, multi-file refactors (~most expensive)

**Adjust effort level:**
Effort controls how deeply Claude thinks before responding. Lower effort = fewer tokens = lower cost.
- `low` < `medium` < `high` < `max`

**Prompt caching:**
Claude Code caches repeated prompt content to reduce costs on subsequent turns. Disable with `DISABLE_PROMPT_CACHING=1` if needed.

## For Automation

Always set `--max-budget-usd` when running Claude Code in scripts or CI. Without it, a stuck agent could burn through credits indefinitely.

```bash
# Safe automation pattern
claude -p "$TASK" \
  --max-budget-usd 2.00 \
  --max-turns 50 \
  --permission-mode bypassPermissions
```

## Team and Enterprise

- Analytics dashboard shows org-wide usage and cost breakdown.
- Monitoring API exports metrics to Prometheus-compatible systems.
- Per-user and per-project cost attribution available.
