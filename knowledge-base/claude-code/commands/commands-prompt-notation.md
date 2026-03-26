---
title: "Claude Code Prompt Notation and Special Syntax"
category: "commands"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-25"
content_hash: ""
---

# Prompt Notation & Special Syntax

These are special prefixes and syntax patterns usable in Claude Code's interactive input.
They are NOT commands — they modify how the input is interpreted.

## File & Context References

| Syntax | Description | Example |
|--------|-------------|---------|
| `@filename` | Reference a file or directory — adds it to context | `@src/auth.py explain this` |
| `#content` | Add content to CLAUDE.md | `#always use TypeScript strict mode` |

## Shell & Task Execution

| Syntax | Description | Example |
|--------|-------------|---------|
| `!command` | Execute a shell command directly | `!git status` |
| `& task` | Run a task in the background | `& run all tests and report` |

## Thinking Modifiers

| Syntax | Description |
|--------|-------------|
| `"Think harder"` | Force high effort for one turn |
| `"Ultra think"` | Force maximum reasoning depth |

These are natural language triggers, not formal syntax. They influence Claude's thinking
effort for that specific turn. The `/effort` command is the formal way to set this.

## Notes

- `@` references work with files AND directories
- `!` runs the command in the current shell session, output lands in the conversation
- `&` backgrounds the task, you get notified when it completes
- `#` appends to the project-level CLAUDE.md
- These notations are interactive-mode only — they don't work with `claude -p`
