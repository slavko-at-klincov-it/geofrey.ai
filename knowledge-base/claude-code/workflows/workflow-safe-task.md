---
title: "How to safely send a task to Claude Code"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
  - "https://docs.anthropic.com/en/docs/claude-code/security"
last_verified: "2026-03-22"
content_hash: ""
---

# Safely Sending a Task to Claude Code

Maestro must follow this checklist before dispatching any task to Claude Code. Skipping steps risks running code in the wrong project, overspending, or making unwanted changes.

## Step-by-Step Process

### Step 1: Identify the correct project directory

Always use an absolute path. Verify it exists:

```bash
ls ~/Code/my-project/package.json  # or whatever marker file
```

### Step 2: Verify the task matches the project

Before sending, confirm the task belongs to this project. A backend bug fix must not go to a frontend-only repo. Check the project's CLAUDE.md to confirm scope.

### Step 3: Choose the right mode

| Mode | Flag | Use When |
|------|------|----------|
| Print (one-shot) | `-p "task"` | Single, well-defined tasks |
| Interactive | (default) | Complex work needing back-and-forth |
| Plan mode | `--permission-mode plan` | Read-only review, no changes |

Use `-p` for most Maestro-dispatched tasks. It runs non-interactively and returns output.

### Step 4: Choose the right model

| Model | Flag | Use When |
|-------|------|----------|
| Sonnet | `--model sonnet` | Most coding tasks, bug fixes, tests |
| Opus | `--model opus` | Complex reasoning, refactoring, architecture decisions |

Default to Sonnet — it is faster and cheaper. Use Opus only when the task requires deep reasoning.

### Step 5: Set appropriate permissions

Only grant what the task needs:

```bash
--allowedTools "Read,Grep,Glob,Edit,Bash(npm run test)"
```

For read-only tasks, omit Edit and Bash entirely. Never grant broad `Bash(*)` access.

### Step 6: Set budget limits

Always set both turn and cost limits:

```bash
--max-turns 20 --max-budget-usd 1.00
```

Guidelines:
- Simple bug fix: 20 turns, $1.00
- Feature implementation: 50 turns, $5.00
- Code review: 15 turns, $0.50
- Refactoring: 50 turns, $5.00

### Step 7: Construct the full command

```bash
claude -p "Fix the login form validation: email field accepts invalid formats. \
The validation regex in src/components/LoginForm.tsx is too permissive. \
Add proper email validation. Run tests after fixing." \
  --cwd ~/Code/my-project/ \
  --model sonnet \
  --max-turns 20 \
  --max-budget-usd 1.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test)"
```

Key rules for the prompt:
- Be specific about what to fix and where
- Tell it to run tests
- Tell it what NOT to do (e.g., "Do not change unrelated code")

### Step 8: Monitor output for errors

After the command runs, check for:
- Exit code (0 = success)
- Error messages in output
- "I was unable to" or "I don't have permission" phrases
- Budget exhaustion warnings

### Step 9: Review changes before committing

```bash
cd ~/Code/my-project && git diff
```

Verify:
- Only expected files were changed
- No unrelated modifications
- No secrets or credentials exposed
- Tests pass: `npm run test`

Only after review, commit the changes.

## Complete Safe-Task Example

```bash
# 1. Verify project exists
test -d ~/Code/meus && echo "OK"

# 2. Send task
OUTPUT=$(claude -p "Add input validation to the /api/users POST endpoint. \
Validate email format and name length (2-100 chars). \
Return 400 with descriptive error messages for invalid input. \
Run existing tests after changes." \
  --cwd ~/Code/meus/ \
  --model sonnet \
  --max-turns 25 \
  --max-budget-usd 1.50 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test)")

# 3. Check result
echo "$OUTPUT"

# 4. Review changes
cd ~/Code/meus && git diff

# 5. Run tests manually to confirm
cd ~/Code/meus && npm run test
```
