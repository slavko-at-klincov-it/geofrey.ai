---
title: "Claude Code CLI Modes: Interactive, Print, and Pipe"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Claude Code CLI Modes

Claude Code can run in three distinct modes. Each mode serves different use cases and has different behaviors around interactivity, output, and session handling.

## 1. Interactive Mode

**Invocation:**
```bash
claude
claude "explain this codebase"
```

**Behavior:**
- Opens a full multi-turn conversation in the terminal.
- Claude can use tools (file reading, editing, bash, etc.) across multiple turns.
- The user can approve or reject tool calls, ask follow-up questions, and steer the conversation.
- Sessions are persisted by default and can be resumed later.

**When to use:**
- Exploratory coding sessions where you want back-and-forth dialogue.
- Tasks where you need to review and approve each step.
- When the scope of work is unclear and requires iterative refinement.

## 2. Print Mode

**Invocation:**
```bash
claude -p "refactor the auth module"
claude -p "fix the failing test in src/utils.test.ts"
```

**Behavior:**
- Sends a single query, Claude executes autonomously, then exits with the result.
- No interactive prompts — Claude runs to completion on its own.
- Supports `--output-format` for structured output (text, json, stream-json).
- Supports `--max-turns` and `--max-budget-usd` to limit execution.
- Supports `--json-schema` for validated structured output.
- By default, sessions are not persisted (use `--session-id` or `--name` to persist).

**When to use:**
- **This is the primary mode for Maestro orchestration.** Maestro launches Claude Code as a subprocess in print mode.
- Scripting and automation pipelines.
- CI/CD integrations.
- Any case where you want Claude to run a task headlessly and return a result.

**Example — Maestro-style invocation:**
```bash
claude -p "implement the login endpoint per the spec in docs/api.md" \
  --model sonnet \
  --permission-mode bypassPermissions \
  --max-turns 50 \
  --max-budget-usd 2.00 \
  --output-format json \
  --append-system-prompt "Follow the project conventions in CONVENTIONS.md"
```

## 3. Pipe Mode

**Invocation:**
```bash
echo "what does this function do?" | claude
cat error.log | claude "explain these errors"
git diff | claude -p "review this diff"
```

**Behavior:**
- Reads input from stdin and passes it as context to Claude.
- Can be combined with print mode (`-p`) for non-interactive piped execution.
- Without `-p`, enters interactive mode after processing piped input.

**When to use:**
- Feeding file contents, logs, or command output directly to Claude.
- Building shell pipelines where Claude is one step in a chain.
- Quick one-off analysis of piped data.

**Example — pipe with print mode:**
```bash
git diff HEAD~3 | claude -p "summarize these changes" --output-format text
```

## Mode Comparison

| Feature              | Interactive     | Print (`-p`)     | Pipe              |
|----------------------|-----------------|------------------|--------------------|
| Multi-turn           | Yes             | No               | Depends on `-p`    |
| User approval        | Yes             | No               | Depends on `-p`    |
| Exits after response | No              | Yes              | Depends on `-p`    |
| Structured output    | No              | Yes              | Yes (with `-p`)    |
| Session persistence  | Yes (default)   | No (default)     | Follows mode used  |
| Best for automation  | No              | **Yes**          | Yes (with `-p`)    |
