---
title: "Practical hook scripts for safety and automation"
category: "hooks"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/hooks"
last_verified: "2026-03-22"
content_hash: ""
---

# Practical Hook Scripts

Ready-to-use hook scripts for common safety and automation patterns.

## 1. Block Destructive Commands

Prevents dangerous shell commands from running.

### Script: `block-destructive.sh`

```bash
#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Patterns that should never be run
DANGEROUS_PATTERNS=(
  'rm\s+-rf\s+/'
  'rm\s+-rf\s+\*'
  'rm\s+-rf\s+\.'
  'drop\s+table'
  'drop\s+database'
  'truncate\s+table'
  'DELETE\s+FROM\s+\w+\s*;?\s*$'
  'mkfs\.'
  'dd\s+if=.*of=/dev/'
  '>\s*/dev/sd'
  'chmod\s+-R\s+777\s+/'
  'chown\s+-R.*/'
  ':(){.*};'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$CMD" | grep -iqE "$pattern"; then
    echo "BLOCKED: Command matches dangerous pattern '$pattern'. Rephrase your approach to avoid destructive operations." >&2
    exit 2
  fi
done

exit 0
```

### Settings configuration:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash /path/to/block-destructive.sh" }
        ]
      }
    ]
  }
}
```

## 2. Block Sensitive File Reads

Prevents Claude from reading files containing secrets.

### Script: `block-secrets-read.sh`

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

SENSITIVE_PATTERNS=(
  '\.env$'
  '\.env\.'
  '\.aws/'
  '\.ssh/'
  'credentials\.json'
  'secrets\.ya?ml'
  '\.gcloud/'
  'token\.json'
  '\.npmrc$'
  '\.pypirc$'
  'id_rsa'
  'id_ed25519'
  '\.pem$'
  '\.key$'
)

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  if echo "$FILE_PATH" | grep -qE "$pattern"; then
    echo "BLOCKED: Cannot read sensitive file '$FILE_PATH'. This file likely contains secrets. Describe what you need and ask the user to provide the relevant non-secret portions." >&2
    exit 2
  fi
done

exit 0
```

### Settings:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          { "type": "command", "command": "bash /path/to/block-secrets-read.sh" }
        ]
      }
    ]
  }
}
```

## 3. Whitelist-Only Commands

Only allow specific commands to run. Everything else is blocked.

### Script: `whitelist-commands.sh`

```bash
#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Extract the base command (first word)
BASE_CMD=$(echo "$CMD" | awk '{print $1}')

# Allowed command prefixes
ALLOWED_PREFIXES=(
  "npm run"
  "npm test"
  "npm install"
  "npx"
  "git status"
  "git diff"
  "git log"
  "git add"
  "git commit"
  "git branch"
  "git checkout"
  "git switch"
  "ls"
  "cat"
  "head"
  "tail"
  "wc"
  "find"
  "grep"
  "rg"
  "node"
  "python3"
  "tsc"
  "eslint"
  "prettier"
)

for prefix in "${ALLOWED_PREFIXES[@]}"; do
  if echo "$CMD" | grep -q "^$prefix"; then
    exit 0
  fi
done

echo "BLOCKED: Command '$CMD' is not in the allowed list. Only development commands (npm, git, node, etc.) are permitted. Ask the user to run this command manually if needed." >&2
exit 2
```

## 4. Auto-Approve Safe Operations

Use a `PermissionRequest` hook to automatically approve known-safe operations without prompting.

### Script: `auto-approve.sh`

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Auto-approve read operations on non-sensitive files
if [ "$TOOL" = "Read" ]; then
  if ! echo "$FILE" | grep -qE '\.(env|pem|key)$|\.ssh/|\.aws/'; then
    echo '{"hookSpecificOutput": {"permissionDecision": "allow", "permissionDecisionReason": "Non-sensitive file read"}}'
    exit 0
  fi
fi

# Auto-approve safe git commands
if [ "$TOOL" = "Bash" ]; then
  if echo "$CMD" | grep -qE '^git (status|diff|log|branch)'; then
    echo '{"hookSpecificOutput": {"permissionDecision": "allow", "permissionDecisionReason": "Read-only git command"}}'
    exit 0
  fi
fi

# Auto-approve npm scripts
if [ "$TOOL" = "Bash" ]; then
  if echo "$CMD" | grep -qE '^npm (run (test|lint|build|dev|start)|test)'; then
    echo '{"hookSpecificOutput": {"permissionDecision": "allow", "permissionDecisionReason": "Standard npm script"}}'
    exit 0
  fi
fi

# For everything else, show the normal prompt
echo '{"hookSpecificOutput": {"permissionDecision": "ask"}}'
exit 0
```

### Settings:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          { "type": "command", "command": "bash /path/to/auto-approve.sh" }
        ]
      }
    ]
  }
}
```

## 5. Re-inject Context After Compaction

When Claude's context is compacted, important instructions can be lost. Use a `SessionStart` hook with the `compact` matcher to re-inject critical context.

### Script: `reinject-context.sh`

```bash
#!/bin/bash
INPUT=$(cat)
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Only run on compaction restarts
if [ "$TRIGGER" != "compact" ]; then
  exit 0
fi

# Write critical context to stderr so Claude sees it
cat >&2 << 'CONTEXT'
IMPORTANT REMINDERS AFTER COMPACTION:
- You are working on the "maestro" project in /Users/dev/Code/maestro
- Always run tests with: npm run test
- Never modify files in /src/core without updating corresponding tests
- The database schema is in /prisma/schema.prisma — check it before writing queries
- API routes follow the pattern: /src/routes/[resource]/[action].ts
CONTEXT

exit 0
```

### Settings:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          { "type": "command", "command": "bash /path/to/reinject-context.sh" }
        ]
      }
    ]
  }
}
```

## 6. Log All Tool Usage

Track every tool call for auditing.

### Script: `log-tools.sh`

```bash
#!/bin/bash
INPUT=$(cat)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')

echo "$TIMESTAMP | session=$SESSION | event=$EVENT | tool=$TOOL | input=$(echo "$INPUT" | jq -c '.tool_input // {}')" >> /tmp/claude-audit.log

exit 0
```

### Settings:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          { "type": "command", "command": "bash /path/to/log-tools.sh" }
        ]
      }
    ]
  }
}
```

No matcher means it fires for every tool call.
