---
title: "Claude Code Bundled Skills — Look Like Commands, Are Prompts"
category: "commands"
source_urls:
  - "claude --help (v2.1.83)"
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-25"
content_hash: ""
---

# Bundled Skills (Not Built-in Commands)

These look like slash commands but are actually **prompt-based skills** that ship with Claude Code.
They are invoked the same way (`/name`) but execute as expanded prompts, not native commands.

**Key difference:** Built-in commands (like `/clear`, `/model`) execute instantly as UI actions.
Skills (like `/simplify`, `/loop`) expand into a full prompt that Claude then processes.

## Verified Bundled Skills

| Skill | Description | Example |
|-------|-------------|---------|
| `/simplify` | 3-agent code review (architecture, duplicates, performance) | `/simplify` or `/simplify error handling` |
| `/batch` | Large-scale parallel changes across worktrees | `/batch add JSDoc to all exported functions` |
| `/debug` | Troubleshoot issues in the current session | `/debug tests are failing with timeout` |
| `/loop` | Run a prompt on a recurring interval | `/loop 5m run tests and report failures` |
| `/claude-api` | Load Claude API/Agent SDK reference docs | Auto-triggers on `anthropic` imports |
| `/schedule` | Create/manage scheduled remote agents (cron) | `/schedule check deploy status daily` |

## User-Installable Skills

Additional skills can be installed via:
- `/skills` menu in interactive mode
- `claude plugin install <name>` from terminal
- `/find-skills` — **DOES NOT EXIST** (use `/skills` instead)

## Skills vs Built-in: How to Tell

- Built-in: Listed in `/help` under "Commands"
- Skills: Listed in `/help` under "Skills" or shown when typing `/`
- Skills can be disabled with `--disable-slash-commands` CLI flag
- Built-in commands cannot be disabled

## Note for geofrey Orchestrator

When generating Claude Code commands with `-p` (print mode):
- Built-in slash commands do NOT work in print mode
- Skills CAN be invoked in print mode: `claude -p "/simplify"`
- If a skill is not installed, the error is: `Unknown skill: <name>`
