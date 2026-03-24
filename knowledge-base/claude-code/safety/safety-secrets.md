---
title: "Preventing secret and credential exposure"
category: "safety"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/security"
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Preventing Secret and Credential Exposure

NEVER pass secrets to Claude Code in prompts or system prompts. Secrets sent in prompts become part of the conversation context and could be logged, cached, or leaked.

## What Counts as a Secret

- API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, STRIPE_SECRET_KEY, etc.)
- Passwords and tokens (database passwords, JWT secrets, OAuth tokens)
- SSH keys (~/.ssh/id_rsa, ~/.ssh/id_ed25519)
- AWS credentials (~/.aws/credentials, AWS_SECRET_ACCESS_KEY)
- GPG keys (~/.gnupg/)
- .env files containing any of the above
- Database connection strings with embedded passwords
- Service account JSON files (e.g., GCP service accounts)
- Certificates and private keys (*.pem, *.key)

## How to Deny Read Access to Sensitive Files

In your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Read(.env*)",
      "Read(**/.env*)",
      "Read(~/.ssh/*)",
      "Read(~/.aws/*)",
      "Read(~/.gnupg/*)",
      "Read(**/credentials*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/serviceaccount*.json)"
    ]
  }
}
```

This prevents Claude Code from reading these files even if instructed to.

## How to Provide Secrets Safely

Set environment variables in your shell BEFORE launching Claude Code. Claude Code inherits the shell's environment.

```bash
# Set in your shell profile or before running Claude Code
export DATABASE_URL="postgres://user:pass@host/db"
export API_KEY="sk-..."

# Claude Code inherits these — it can use them in commands
# but they never appear in the conversation context
claude -p "Run the database migration"
```

Claude Code can then use `$DATABASE_URL` in shell commands without the actual value ever appearing in the prompt.

## Hook-Based Secret Detection

Use a PreToolUse hook to intercept reads of sensitive files:

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=""

if [ "$TOOL" = "Read" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
elif [ "$TOOL" = "Bash" ]; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  # Check if command reads sensitive files
  if echo "$COMMAND" | grep -qE 'cat.*(\.env|credentials|\.pem|\.key|id_rsa)'; then
    echo "BLOCKED: Command attempts to read sensitive file" >&2
    exit 2
  fi
fi

# Block direct reads of sensitive files
if [ -n "$FILE_PATH" ]; then
  case "$FILE_PATH" in
    */.env*|*/.ssh/*|*/.aws/*|*/.gnupg/*|*/credentials*|*.pem|*.key)
      echo "BLOCKED: Read of sensitive file — $FILE_PATH" >&2
      exit 2
      ;;
  esac
fi

exit 0
```

## Common Mistakes

- Pasting API keys into the prompt: "Use this key: sk-abc123..." — NEVER do this
- Asking Claude Code to "read my .env file and use those values" — blocked by deny rules
- Storing secrets in CLAUDE.md or settings files — these are read into context
- Using --system-prompt with embedded credentials — becomes part of conversation

## For Maestro Orchestration

When spawning Claude Code sessions programmatically:

1. Pass secrets via environment variables to the subprocess
2. Never include secrets in the `-p` prompt argument
3. Never include secrets in `--system-prompt`
4. Use deny rules in settings to prevent accidental reads
5. Use hooks as a second layer of defense
