---
title: "Permission evaluation order and settings precedence"
category: "permissions"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/permissions"
last_verified: "2026-03-22"
content_hash: ""
---

# Permission Evaluation Order and Precedence

## Rule Evaluation Order

When Claude attempts to use a tool, permissions are evaluated in this order:

**deny -> ask -> allow** (first match wins, deny always takes precedence)

1. **Check deny rules** — if any deny rule matches, the tool call is blocked immediately. No further rules are checked.
2. **Check ask rules** — if any ask rule matches, the user is prompted for permission.
3. **Check allow rules** — if any allow rule matches, the tool call proceeds.
4. **Check permission mode** — if no rules match, the active permission mode determines the behavior (prompt in `default`, block in `dontAsk`, allow in `bypassPermissions`, etc.).

### Example

```json
{
  "permissions": {
    "allow": ["Bash(git *)"],
    "deny": ["Bash(git push --force *)"],
    "ask": ["Bash(git push *)"]
  }
}
```

With these rules:
- `git push --force main` — **denied** (matches deny rule)
- `git push origin main` — **asks** (matches ask rule)
- `git status` — **allowed** (matches allow rule)
- `git log` — **allowed** (matches allow rule)

The deny rule for `git push --force` takes precedence over the allow rule for `git *` because deny is always evaluated first.

## Settings Precedence

Permission rules can be defined in multiple settings files. When rules conflict, higher-precedence sources win. **Precedence from highest to lowest:**

### 1. Managed settings (highest)
**Path:** `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS) or `/etc/claude-code/managed-settings.json` (Linux)

Cannot be overridden by any other source. Used by organizations to enforce security policies.

```json
{
  "permissions": {
    "deny": ["Bash(curl *)", "Bash(wget *)"],
    "defaultMode": "default"
  }
}
```

### 2. CLI arguments
```bash
claude --permission-mode dontAsk \
       --allowedTools "Bash(npm *)" "Read(*)" \
       --disallowedTools "Bash(rm *)"
```

CLI flags override all file-based settings except managed settings.

### 3. Local project settings
**Path:** `.claude/settings.local.json`

Personal overrides for this project. Gitignored — not shared with the team.

```json
{
  "permissions": {
    "allow": ["Bash(docker *)"]
  }
}
```

### 4. Shared project settings
**Path:** `.claude/settings.json`

Committed to git. Shared with the entire team.

```json
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "Bash(npm run *)"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ]
  }
}
```

### 5. User settings
**Path:** `~/.claude/settings.json`

Applies to all projects for this user. Lowest file-based precedence.

```json
{
  "permissions": {
    "allow": ["Read(*)", "Glob(*)", "Grep(*)"],
    "deny": ["Read(.env*)", "Read(~/.ssh/*)"]
  }
}
```

### 6. Defaults (lowest)
Built-in defaults when no rules or mode is configured. Equivalent to `default` mode with no custom rules.

## How Precedence Merges

Rules from different sources are **merged, not replaced**:

- All `deny` rules from all sources are combined. If any source denies a tool, it is denied.
- All `allow` rules from all sources are combined.
- All `ask` rules from all sources are combined.
- For `defaultMode`, the highest-precedence source that specifies it wins.

This means a deny rule in user settings cannot be overridden by an allow rule in project settings. **Deny always wins across all sources.**

## Practical Implications

| Scenario | Outcome |
|---|---|
| Managed denies `Bash(curl *)`, project allows `Bash(curl *)` | Denied (managed wins) |
| User denies `Read(.env*)`, project allows `Read(.env*)` | Denied (deny wins over allow) |
| CLI flag `--allowedTools "Bash(rm *)"`, project denies `Bash(rm *)` | Denied (deny wins) |
| Project allows `Edit(/src/**)`, no deny rules | Allowed |
| No rules match, mode is `default` | User is prompted |
| No rules match, mode is `dontAsk` | Denied |
| No rules match, mode is `bypassPermissions` | Allowed |

## Hooks vs. Permissions

Hooks (`PreToolUse`, `PermissionRequest`) run **in addition to** permission rules. A hook can block a tool call even if permissions allow it. Hooks provide runtime evaluation while permission rules provide static configuration.
