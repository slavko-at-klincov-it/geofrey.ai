---
title: "Plan Mode: Safe Read-Only Exploration Before Implementation"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Plan Mode

Plan mode restricts Claude to read-only exploration. Claude can read files, search code, and ask questions — but cannot edit files or run commands that modify anything.

## Activating Plan Mode

```bash
# From the command line
claude --permission-mode plan

# Inside a session
# Press Shift+Tab to cycle through modes: default → plan → default
```

## What Claude CAN Do in Plan Mode

- Read files and search code (Grep, Glob, Read tools)
- Ask clarifying questions via the AskUserQuestion tool
- Analyze architecture and dependencies
- Create detailed plans with file lists, approach, and risks

## What Claude CANNOT Do in Plan Mode

- Edit or create files
- Run bash commands
- Execute any tool that modifies the filesystem or environment

## Recommended Workflow

1. **Start in plan mode** — let Claude explore the codebase and ask questions
2. **Claude produces a plan** — file lists, approach, potential risks, estimated changes
3. **Use `/compact`** to compress the conversation and free context window space
4. **Switch to default mode** (Shift+Tab) — Claude implements the plan

## When to Use Plan Mode

- Understanding an unfamiliar codebase before making changes
- Planning a migration or large refactor
- Analyzing architecture to identify risks
- Getting a second opinion on approach before committing to implementation

## Example

```bash
claude --permission-mode plan
```
Then in the session:
```
> Analyze the auth system in this project. Identify all files involved,
  how sessions are managed, and create a migration plan to switch
  from JWT to session-based auth.
```

Claude will explore the codebase, ask clarifying questions, and produce a structured plan — without touching any files.

## Tips

- Use the `opus` model (`--model opus`) for deeper analysis during planning — the extra reasoning depth pays off when exploring complex codebases.
- After planning, run `/compact` before switching to default mode. This frees context space for the implementation phase.
- Plan mode is especially valuable for print-mode automation: run a plan-mode pass first, review the output, then run the implementation pass.
