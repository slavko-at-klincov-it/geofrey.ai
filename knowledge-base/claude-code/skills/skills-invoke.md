---
title: "How Skills Get Invoked"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# How Skills Get Invoked

Skills can be triggered in several ways, each suited to different use cases.

## Manual Invocation

Type the skill name as a slash command:

```
/commit fix login bug
/review-pr 1234
/batch update all imports to use new module path
```

Autocomplete is available — type `/` and press Tab to browse, or start typing to filter.

Arguments after the skill name are passed as `$ARGUMENTS` (and `$1`, `$2`, etc.) to the skill.

## Automatic Invocation (Model-Triggered)

By default, Claude reads the `description` field of every available skill. When a user request matches a skill's description, Claude invokes it automatically.

Example: A skill with `description: "Create git commits with conventional format"` will be auto-invoked when the user says "commit my changes."

This is the default behavior for all skills unless explicitly disabled.

## @-Mention Invocation

Reference a skill inline using @-mention syntax:

```
Can you @review-pr the changes in this branch?
```

## Controlling Invocation Behavior

### Manual Only

Set `disable-model-invocation: true` in frontmatter. The skill will only run when the user explicitly types `/skill-name`.

```yaml
---
name: dangerous-cleanup
description: "Delete all temporary files and caches"
disable-model-invocation: true
---
```

### Claude Only (Not User-Invocable)

Set `user-invocable: false`. The skill can only be triggered by Claude's automatic invocation, not by typing a slash command.

```yaml
---
name: internal-helper
description: "Format output tables consistently"
user-invocable: false
---
```

### Deny via Permissions

Block skill invocation entirely using permission deny rules:

```
# Block a specific skill
Skill(name dangerous-cleanup) → deny

# Block all skills
Skill(name *) → deny

# Block the Skill tool entirely
Skill → deny
```

These rules go in `.claude/settings.json` or `~/.claude/settings.json`.

## Invocation Summary

| Method | Syntax | When to Use |
|---|---|---|
| Slash command | `/skill-name [args]` | Explicit, intentional use |
| Auto-invocation | (automatic) | Seamless integration with natural requests |
| @-mention | `@skill-name` | Inline reference in a longer prompt |
| Claude-only | `user-invocable: false` | Internal helper skills |
| Disabled auto | `disable-model-invocation: true` | Dangerous or costly operations |
