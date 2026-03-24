---
title: "Claude Code Permission and Safety Flags"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Permission and Safety Flags

These flags control what Claude Code is allowed to do without human approval. In automation (print mode), permission configuration is critical because there is no human to approve prompts.

## `--permission-mode <mode>`

Set the overall permission policy. Available modes:

| Mode                 | Behavior                                                              |
|----------------------|-----------------------------------------------------------------------|
| `default`            | Prompt for approval on writes and shell commands. Normal interactive behavior. |
| `acceptEdits`        | Auto-approve file edits. Still prompt for shell commands.             |
| `plan`               | Read-only. Claude can read files and plan but cannot make changes.    |
| `dontAsk`            | Skip tools that would require permission instead of prompting.        |
| `bypassPermissions`  | Auto-approve everything. No permission prompts at all.                |

```bash
# Read-only analysis
claude -p "review the codebase architecture" --permission-mode plan

# Auto-approve edits but prompt for bash
claude -p "refactor the utils module" --permission-mode acceptEdits

# Full autonomy (for automation)
claude -p "implement the feature" --permission-mode bypassPermissions
```

### Choosing a Permission Mode for Automation

For Maestro orchestration in print mode, the main choices are:

- **`bypassPermissions`** — Full autonomy. Claude can read, write, and execute anything. Use when the task requires making changes and running commands (tests, builds, etc.).
- **`acceptEdits`** — Claude can edit files freely but cannot run arbitrary shell commands. Safer if you want to prevent unexpected command execution.
- **`plan`** — Read-only. Use for analysis, code review, or planning tasks where no changes should be made.
- **`dontAsk`** — Claude silently skips any action it would normally ask permission for. Useful when you want best-effort execution without blocking.

## `--dangerously-skip-permissions`

Skip ALL permission prompts unconditionally. This is equivalent to `--permission-mode bypassPermissions` but more explicit about the risk.

```bash
claude -p "task" --dangerously-skip-permissions
```

**Warning:** This allows Claude to run any shell command, modify any file, and perform destructive operations without confirmation. Only use in sandboxed or disposable environments.

## `--tools <list>`

Restrict Claude to a specific set of tools. Tools not in the list are unavailable.

```bash
# Only allow reading and searching
claude -p "analyze this code" --tools "Read,Grep,Glob"

# Allow editing but no shell access
claude -p "refactor this" --tools "Read,Grep,Glob,Edit,Write"
```

Available tools include: `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch`, `NotebookEdit`, and others.

## `--allowedTools <patterns>`

Specify tools that execute without prompting (auto-approved). Other tools still require approval or follow the permission mode.

```bash
# Auto-approve read operations, prompt for everything else
claude "help me refactor" --allowedTools "Read,Grep,Glob"
```

Supports glob patterns:

```bash
# Allow all MCP server tools from a specific server
claude "task" --allowedTools "mcp__myserver__*"
```

## `--disallowedTools <patterns>`

Completely remove tools so Claude cannot use them at all. Takes precedence over `--allowedTools`.

```bash
# Prevent any shell command execution
claude -p "task" --disallowedTools "Bash"

# Prevent file modifications
claude -p "task" --disallowedTools "Edit,Write,Bash"
```

## Combining Flags

These flags compose together. For example:

```bash
# Full autonomy but no shell access
claude -p "refactor the auth module" \
  --permission-mode bypassPermissions \
  --disallowedTools "Bash"

# Read-only with specific tools
claude -p "review this PR" \
  --permission-mode plan \
  --tools "Read,Grep,Glob"
```

## Recommended Patterns for Orchestration

**Implementation task (full access):**
```bash
claude -p "implement feature X" \
  --permission-mode bypassPermissions \
  --max-turns 50
```

**Code review (read-only):**
```bash
claude -p "review src/auth/ for security issues" \
  --permission-mode plan
```

**Safe editing (no shell):**
```bash
claude -p "add type annotations to src/utils.ts" \
  --permission-mode bypassPermissions \
  --disallowedTools "Bash"
```
