---
title: "What are Claude Code Skills"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Claude Code Skills Overview

Skills are reusable, prompt-based extensions that add capabilities to Claude Code. They follow the **Agent Skills** open standard.

## What a Skill Is

A skill is a `SKILL.md` file containing structured frontmatter and a prompt body. When invoked, Claude reads the skill file and follows its instructions as part of the conversation.

Skills can:
- Define new slash commands (e.g., `/commit`, `/review-pr`)
- Add domain-specific knowledge or workflows
- Restrict which tools Claude can use during execution
- Run in isolated subagent contexts
- Be triggered manually or automatically

## Where Skills Live

Skills are discovered from specific directories:

| Location | Scope |
|---|---|
| `~/.claude/skills/my-skill/SKILL.md` | Global — available in all projects |
| `.claude/skills/my-skill/SKILL.md` | Project — available only in that repo |
| Installed via plugins | Namespaced under the plugin name |

## Manual vs Automatic Invocation

- **Manual**: Type `/skill-name` in a session to invoke explicitly.
- **Automatic**: Claude reads each skill's `description` field and decides when to invoke it based on the user's request. This is the default behavior.

## Example

A minimal skill at `~/.claude/skills/greet/SKILL.md`:

```markdown
---
name: greet
description: "Greet the user by name"
---

Say hello to the user. If they provided a name via $ARGUMENTS, use it. Otherwise ask for their name.
```

Invoke with: `/greet Alice`

## Key Points

- No compilation or build step — skills are plain Markdown files.
- They are discovered automatically when placed in the correct directories.
- Skills can call other skills and use all standard Claude Code tools.
- The Agent Skills standard means skills are portable across compatible tools.
