---
title: "Dangerous operation patterns to detect and block"
category: "safety"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/hooks"
  - "https://docs.anthropic.com/en/docs/claude-code/security"
last_verified: "2026-03-22"
content_hash: ""
---

# Dangerous Operation Patterns

Claude Code can execute arbitrary shell commands. You MUST detect and block dangerous operations before they run.

## Categories of Dangerous Operations

### File Deletion
- `rm -rf` / `rm -r` — recursive deletion, can wipe entire directories
- `shred` — securely destroys file contents, unrecoverable
- `unlink` — removes files or symlinks
- `find ... -delete` — bulk deletion by pattern

### Database Destruction
- `DROP TABLE` / `DROP DATABASE` — permanently removes database objects
- `TRUNCATE` — removes all rows instantly, no rollback in most engines
- `DELETE` without `WHERE` — deletes every row in a table

### Git Destruction
- `git push --force` / `git push -f` — overwrites remote history, data loss for entire team
- `git reset --hard` — discards all uncommitted changes
- `git clean -f` — deletes untracked files permanently
- `git branch -D` — force-deletes a branch even if unmerged

### System Commands
- `kill` / `killall` — terminates processes
- `shutdown` / `reboot` — shuts down or restarts the machine
- `chmod 777` / `chmod -R` — dangerous permission changes

### Network Exfiltration
- `curl -X POST` / `curl -d` to unknown URLs — could send data to attacker
- `wget` to unknown URLs — could download malicious payloads
- `nc` (netcat) — arbitrary network connections

### Package Destruction
- `npm publish` — accidental publish of private code
- `pip install --force` — overwrite existing packages without checks

## How to Block: PreToolUse Hooks

Use a PreToolUse hook with the `Bash` tool matcher. The hook receives a JSON payload on stdin containing the command. Exit code 2 blocks the operation.

### Example: settings.json hook configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/safety-check.sh"
          }
        ]
      }
    ]
  }
}
```

### Example: safety-check.sh

```bash
#!/bin/bash
# Read the JSON input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Define dangerous patterns
DANGEROUS_PATTERNS=(
  'rm -rf'
  'rm -r '
  'shred '
  'git push --force'
  'git push -f'
  'git reset --hard'
  'git clean -f'
  'git branch -D'
  'DROP TABLE'
  'DROP DATABASE'
  'TRUNCATE '
  'kill -9'
  'killall '
  'shutdown'
  'reboot'
  'npm publish'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo "BLOCKED: Dangerous operation detected — $pattern" >&2
    exit 2  # Exit 2 = block the tool call
  fi
done

# Check for DELETE without WHERE
if echo "$COMMAND" | grep -qi "DELETE FROM" && ! echo "$COMMAND" | grep -qi "WHERE"; then
  echo "BLOCKED: DELETE without WHERE clause" >&2
  exit 2
fi

# Check for curl/wget POST to non-localhost
if echo "$COMMAND" | grep -qiE '(curl.*-X POST|curl.*-d |wget )' && \
   ! echo "$COMMAND" | grep -qi 'localhost\|127\.0\.0\.1'; then
  echo "BLOCKED: Network request to external URL" >&2
  exit 2
fi

exit 0  # Exit 0 = allow
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Allow the operation |
| 1    | Error in hook (shows warning but continues) |
| 2    | Block the operation (tool call is rejected) |

### Hook JSON Input Format

The PreToolUse hook receives JSON on stdin:

```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /important/directory"
  }
}
```

Parse `tool_input.command` to inspect what Claude Code is about to execute.
