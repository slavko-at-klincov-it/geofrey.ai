---
title: "Skill Resolution and Precedence Order"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Skill Resolution and Precedence Order

When multiple skills share the same name, Claude Code resolves the conflict using a fixed priority order.

## Priority Order (Highest to Lowest)

| Priority | Source | Example Path |
|---|---|---|
| 1 (highest) | Enterprise skills | Managed settings pushed by organization admins |
| 2 | Personal skills | `~/.claude/skills/my-skill/SKILL.md` |
| 3 | Project skills | `.claude/skills/my-skill/SKILL.md` |
| 4 (lowest) | Plugin skills | Installed via `/plugin install` |

The higher-priority skill wins on name collision. The lower-priority skill is shadowed and will not be invoked.

## Plugin Namespacing

Plugin skills use a namespace to prevent conflicts:

```
/plugin-name:skill-name
```

For example, if the `commit-commands` plugin provides a skill called `commit`:

```
/commit-commands:commit    # Always reaches the plugin skill
/commit                    # Reaches highest-priority "commit" skill
```

This means plugin skills are always reachable via their fully qualified name, even when shadowed.

## Practical Examples

### Name Collision

If you have:
- `~/.claude/skills/deploy/SKILL.md` (personal)
- `.claude/skills/deploy/SKILL.md` (project)

Running `/deploy` invokes the **personal** skill (priority 2 beats priority 3).

### Overriding a Plugin Skill

If a plugin provides `/format` but you want custom behavior:

1. Create `~/.claude/skills/format/SKILL.md` with your version.
2. Your personal skill takes priority over the plugin skill.
3. The plugin version remains accessible as `/plugin-name:format`.

## Monorepo Discovery

In monorepos, Claude discovers `.claude/skills/` directories in nested subdirectories. Skills from the current working context take effect.

## --add-dir Directories

Skills from directories added via the `--add-dir` CLI flag are loaded automatically and follow the same precedence rules based on their source type.

## Debugging Precedence

If a skill isn't behaving as expected:

1. Check `/help` to see which skills are loaded and their sources.
2. Use the fully qualified name (`/plugin-name:skill-name`) to test if a plugin skill is being shadowed.
3. Verify the skill file is in the correct directory and has valid frontmatter.
