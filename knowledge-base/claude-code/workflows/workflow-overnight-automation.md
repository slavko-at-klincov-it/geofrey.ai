---
title: "Running Claude Code unattended overnight"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-usage"
last_verified: "2026-03-22"
content_hash: ""
---

# Overnight Automation

Run Claude Code unattended for long tasks while you sleep or step away.

## /loop — Repeated Execution

The `/loop` command runs a prompt repeatedly at a fixed interval:

```
/loop 5m /check-tests
/loop 30s "monitor build output"
/loop 2h "check for dependency updates and create PRs"
```

Supported intervals: seconds (`30s`), minutes (`5m`), hours (`2h`). Runs until you cancel with Ctrl+C.

## Headless Mode

Run Claude non-interactively with safety limits:

```bash
claude -p "refactor auth module and fix all tests" \
  --max-turns 100 \
  --max-budget-usd 10
```

Claude works autonomously and exits when the task is complete or limits are reached.

## Bash Loop Pattern

For repeated overnight runs, wrap `claude -p` in a shell loop:

```bash
while true; do
  claude -p "check and fix failing tests" \
    --cwd ~/Code/project/ \
    --model sonnet \
    --max-turns 30
  sleep 300
done
```

This runs every 5 minutes. Redirect output to a log file for review in the morning:

```bash
while true; do
  claude -p "run tests, fix failures" \
    --cwd ~/Code/myapp/ \
    --max-turns 30 \
    --output-format json >> ~/logs/overnight.jsonl 2>&1
  sleep 300
done
```

## Background Agents

Subagents with `background: true` in their frontmatter run independently of the main session.

## Desktop Scheduled Tasks

Schedule recurring tasks (daily code review, dependency checks) via the Claude Code Desktop app.

## Remote Sessions

```bash
claude --remote
```

Runs on Anthropic cloud infrastructure. Survives machine shutdown — check progress from phone or another device.

## Safety Rules for Overnight Runs

**ALWAYS** set both limits to prevent runaway costs:

- `--max-turns N` — caps the number of tool calls
- `--max-budget-usd N.NN` — caps total spend

Use `--output-format json` to parse results programmatically the next morning.
