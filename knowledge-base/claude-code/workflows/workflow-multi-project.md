---
title: "Managing multiple projects with Claude Code"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Managing Multiple Projects with Claude Code

When Maestro orchestrates work across several projects, strict scoping prevents cross-contamination — running a task in the wrong project or leaking context between repos.

## Core Principles

### Always use --cwd to scope to the right project

Every Claude Code invocation must specify the project directory explicitly:

```bash
claude -p "Fix the auth bug" --cwd ~/Code/meus/
claude -p "Add the invoice export" --cwd ~/Code/aibuchhalter/
```

Never rely on the current working directory. Always pass `--cwd`.

### Never run from a parent directory

Running Claude Code from `~/Code/` when it contains multiple projects is dangerous. Claude Code may read or modify files in the wrong project.

```bash
# WRONG — ambiguous scope
cd ~/Code && claude -p "Fix the login page"

# CORRECT — explicit project
claude -p "Fix the login page" --cwd ~/Code/meus/
```

### Each project has its own .claude/ directory

Project-specific settings live in each repo:

```
~/Code/meus/.claude/settings.json        # meus permissions
~/Code/aibuchhalter/.claude/settings.json # aibuchhalter permissions
~/Code/maestro/.claude/settings.json      # maestro permissions
```

These are independent. Permissions granted in one project do not apply to another.

## Using Different Permission Profiles

Tailor permissions to each project's needs:

```json
// ~/Code/meus/.claude/settings.json (React Native app)
{
  "permissions": {
    "allow": ["Bash(npx expo start)", "Bash(npm run test)", "Read", "Edit", "Glob", "Grep"],
    "deny": ["Bash(rm -rf *)"]
  }
}
```

```json
// ~/Code/aibuchhalter/.claude/settings.json (Python backend)
{
  "permissions": {
    "allow": ["Bash(poetry run pytest)", "Bash(poetry run ruff check .)", "Read", "Edit", "Glob", "Grep"],
    "deny": ["Bash(rm -rf *)", "Bash(pip install *)"]
  }
}
```

## Tracking Sessions with --name

Use `--name` to label sessions for each project, making it easier to resume or review:

```bash
claude -p "Add dark mode" --cwd ~/Code/meus/ --name "meus-dark-mode"
claude -p "Fix invoice PDF" --cwd ~/Code/aibuchhalter/ --name "aibuchhalter-invoice-fix"
```

## Safe Project Switching Example

Switching from working on "meus" to "aibuchhalter":

```bash
# 1. Finish meus task
claude -p "Run all tests and report results" --cwd ~/Code/meus/ --model sonnet --max-turns 10

# 2. Verify meus state is clean
cd ~/Code/meus && git status

# 3. Switch to aibuchhalter — always use --cwd
claude -p "Add VAT calculation to invoice totals" \
  --cwd ~/Code/aibuchhalter/ \
  --model sonnet \
  --max-turns 30 \
  --max-budget-usd 2.00

# 4. Verify only aibuchhalter was modified
cd ~/Code/meus && git status         # should show no changes
cd ~/Code/aibuchhalter && git diff   # should show the new feature
```

## Common Pitfall: Forgetting --cwd

The most frequent mistake is omitting `--cwd`. Symptoms:

- Claude Code modifies files in the wrong project
- It reads a different project's CLAUDE.md and follows wrong conventions
- Tests from one project run in another project's context

Prevention: Maestro should always construct commands with `--cwd` as a required field. Never make it optional. Validate the path exists before running.

```bash
# Maestro's pre-flight check
PROJECT_DIR="$HOME/Code/meus"
if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  echo "ERROR: Project not found or not set up for Claude Code"
  exit 1
fi
claude -p "task here" --cwd "$PROJECT_DIR"
```
