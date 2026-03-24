---
title: "Using Claude Code in scripts and automation"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-usage"
last_verified: "2026-03-22"
content_hash: ""
---

# Headless Scripting

Use Claude Code non-interactively in shell scripts, cron jobs, and CI pipelines.

## Print Mode

```bash
claude -p "query"
```

Runs non-interactively. Claude processes the query, outputs the result, and exits. No interactive session.

## Output Formats

```bash
claude -p "list all API routes" --output-format text      # plain text (default)
claude -p "list all API routes" --output-format json       # structured JSON
claude -p "list all API routes" --output-format stream-json # streaming JSON lines
```

## Structured Output with JSON Schema

Force Claude to return validated structured data:

```bash
claude -p "analyze this function for bugs" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"bugs":{"type":"array","items":{"type":"string"}},"severity":{"type":"string"}}}'
```

The output is validated against the schema before returning.

## Piping Input

```bash
echo "review this code for security issues" | claude
cat src/auth.py | claude -p "review this code"
git diff HEAD~1 | claude -p "summarize these changes"
```

## Chaining Claude Calls

```bash
claude -p "generate unit tests for auth.py" --cwd ~/project \
  | claude -p "review these tests for edge cases"
```

## Continue a Conversation

```bash
claude -p "analyze the auth module" --cwd ~/project
claude -p "now fix the issues you found" --continue
```

The `--continue` flag resumes the most recent session.

## Budget and Safety Limits

```bash
claude -p "refactor everything" --max-turns 50 --max-budget-usd 5.00
```

- `--max-turns N` — maximum number of tool calls before stopping
- `--max-budget-usd N.NN` — maximum dollar spend before stopping
- `--fallback-model haiku` — auto-fallback when primary model is overloaded

## Environment Detection

Inside any shell spawned by Claude Code, the environment variable `CLAUDECODE=1` is set. Use this to detect Claude-spawned shells in your scripts.

## Exit Codes

- `0` — success
- Non-zero — error (parse stderr for details)

## Example: Nightly Test Fix Script

```bash
#!/bin/bash
RESULT=$(claude -p "run tests, identify failures, fix them, run tests again" \
  --cwd ~/Code/myapp \
  --max-turns 30 \
  --max-budget-usd 3.00 \
  --output-format json)

STATUS=$(echo "$RESULT" | jq -r '.result' 2>/dev/null)

if [ $? -eq 0 ]; then
  echo "Claude completed: $STATUS"
  # Create PR if changes were made
  cd ~/Code/myapp && git diff --quiet || \
    gh pr create --title "Auto-fix: test failures" --body "Automated fix by Claude Code"
fi
```

## Parsing JSON Output

```bash
claude -p "list all TODO comments" --output-format json | jq '.result'
```
