---
title: "Creating Custom Skills"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Creating Custom Skills

A skill is defined by a `SKILL.md` file with YAML frontmatter and a Markdown prompt body.

## SKILL.md Format

```markdown
---
name: my-skill
description: "What this skill does — Claude reads this to decide when to auto-invoke"
argument-hint: "[file] [options]"
---

Your prompt instructions here. Claude follows these when the skill is invoked.

Use $ARGUMENTS to access everything the user typed after the skill name.
```

## All Frontmatter Fields

### Required

| Field | Description |
|---|---|
| `name` | Skill identifier. Lowercase, hyphens only. Used as the slash command name. |
| `description` | What the skill does. **Critical for auto-invocation** — Claude reads this to decide when to use the skill. |

### Optional — Invocation Control

| Field | Values | Description |
|---|---|---|
| `argument-hint` | `"[arg1] [arg2]"` | Shown in autocomplete after the skill name |
| `disable-model-invocation` | `true` | Skill can only be invoked manually via `/name`, never automatically |
| `user-invocable` | `false` | Only Claude can invoke this skill, not the user |

### Optional — Execution Control

| Field | Values | Description |
|---|---|---|
| `allowed-tools` | `Read, Grep, Bash` | Restrict which tools the skill can use |
| `model` | `sonnet`, `opus`, `haiku`, `inherit` | Override the model for this skill |
| `effort` | `low`, `medium`, `high`, `max` | Set reasoning effort level |
| `context` | `fork` | Run in an isolated subagent (separate context window) |
| `agent` | `Explore`, `Plan`, `general-purpose` | Use a specialized agent type |

### Optional — Lifecycle

| Field | Description |
|---|---|
| `hooks` | JSON object defining lifecycle hooks (pre-run, post-run, etc.) |

## String Substitutions

Use these variables in the prompt body:

| Variable | Expands To |
|---|---|
| `$ARGUMENTS` | Everything after the skill name: `/my-skill foo bar` → `foo bar` |
| `$0` | The skill name itself |
| `$1`, `$2`, ... | Positional arguments (space-separated) |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Absolute path to the directory containing this SKILL.md |
| `` !`command` `` | Shell preprocessing — output of the command is substituted |

## Examples

### Simple Skill

```markdown
---
name: todo
description: "List or add TODO items in the codebase"
argument-hint: "[add <text> | list]"
---

Search the codebase for TODO comments. If $1 is "add", create a new TODO.
If $1 is "list" or empty, find and display all TODOs.
```

### Restricted Skill with Subagent

```markdown
---
name: safe-review
description: "Review code without making changes"
allowed-tools: Read, Grep, Glob
context: fork
model: sonnet
---

Review the code at $1. Identify bugs, style issues, and potential improvements.
Do NOT modify any files. Output a structured review.
```

### Skill with Shell Preprocessing

```markdown
---
name: deploy-check
description: "Verify deployment readiness"
disable-model-invocation: true
---

Current branch: !`git branch --show-current`
Last commit: !`git log --oneline -1`

Verify this branch is ready for deployment. Check for:
1. No uncommitted changes
2. All tests pass
3. No TODO/FIXME in changed files
```

## Directory Structure

A skill can include supporting files alongside SKILL.md:

```
.claude/skills/my-skill/
  SKILL.md              # Required
  templates/
    pr-template.md      # Referenced via ${CLAUDE_SKILL_DIR}/templates/
  scripts/
    validate.sh         # Called via !`${CLAUDE_SKILL_DIR}/scripts/validate.sh`
```
