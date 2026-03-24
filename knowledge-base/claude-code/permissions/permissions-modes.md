---
title: "Permission modes: default, acceptEdits, plan, dontAsk, bypassPermissions"
category: "permissions"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/permissions"
last_verified: "2026-03-22"
content_hash: ""
---

# Permission Modes

Claude Code has 5 permission modes that control how tool usage is approved. Each mode offers a different balance between safety prompts and workflow speed.

## 1. default

The standard mode. Claude prompts for permission on the first use of each tool. The user can select "don't ask again" to approve that tool for the remainder of the session.

Behavior:
- First use of each tool type triggers a permission prompt
- "Don't ask again" creates a session-scoped allow rule
- Allow/deny rules from settings still apply
- Most interactive and safest mode

## 2. acceptEdits

Auto-accepts file editing permissions (`Edit`, `Write`). All other tools still prompt.

Behavior:
- File edits proceed without prompting
- Bash commands, web fetches, etc. still prompt
- Good for coding sessions where you trust Claude's edits but want control over command execution

## 3. plan

Read-only mode. Claude cannot edit files or execute commands. Only read operations are allowed.

Behavior:
- `Read`, `Glob`, `Grep` are allowed
- `Edit`, `Write`, `Bash` are blocked
- Useful for code review, exploration, and planning
- Claude can analyze and explain but cannot modify anything

## 4. dontAsk

Auto-denies all permissions unless explicitly pre-approved via allow rules in settings.

Behavior:
- No permission prompts are shown
- Any tool not covered by an allow rule is silently denied
- You must configure `permissions.allow` to specify what Claude can do
- Best for CI/CD and automated pipelines where interaction is impossible

Example settings for `dontAsk` mode:
```json
{
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "Edit(*)",
      "Write(*)",
      "Bash(npm run test)",
      "Bash(npm run lint)",
      "Bash(git diff *)"
    ],
    "deny": [
      "Bash(rm *)",
      "Bash(git push *)"
    ]
  }
}
```

## 5. bypassPermissions

Skips all permission prompts. Claude can use any tool freely.

Behavior:
- No prompts for any operation
- Exception: writes to `.git/`, `.claude/`, `.vscode/`, `.idea/` directories still prompt (safety guardrail)
- Fastest workflow, least oversight
- Intended for trusted environments and experienced users

## Switching Permission Modes

There are multiple ways to change the active permission mode:

### CLI flag
```bash
claude --permission-mode plan
claude --permission-mode bypassPermissions
```

### Interactive command
Type `/permissions` in the Claude Code prompt to open the mode selector.

### Keyboard shortcut
Press **Shift+Tab** to cycle through modes during a session.

### Settings file
```json
{
  "permissions": {
    "defaultMode": "acceptEdits"
  }
}
```

Set in any settings file (`~/.claude/settings.json`, `.claude/settings.json`, or `.claude/settings.local.json`).

### CLI flags for allow/deny rules
```bash
claude --allowedTools "Bash(npm *)" "Edit(*)" --disallowedTools "Bash(rm *)"
```

## Mode Comparison

| Mode | Edit | Bash | Read | Prompts |
|---|---|---|---|---|
| default | prompt | prompt | prompt | Yes, first use |
| acceptEdits | auto-allow | prompt | prompt | Only non-edit tools |
| plan | blocked | blocked | auto-allow | None (read-only) |
| dontAsk | per rules | per rules | per rules | None |
| bypassPermissions | auto-allow | auto-allow | auto-allow | None (except protected dirs) |
