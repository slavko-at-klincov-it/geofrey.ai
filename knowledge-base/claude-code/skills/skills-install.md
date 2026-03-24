---
title: "Installing and Managing Skills"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Installing and Managing Skills

There are two methods to add skills to Claude Code.

## Method A: Standalone Skills (File-Based)

Create a `SKILL.md` file in the appropriate directory. No install step needed — Claude discovers it automatically.

### Global Skill (all projects)

```bash
mkdir -p ~/.claude/skills/my-skill
# Create ~/.claude/skills/my-skill/SKILL.md with your skill content
```

### Project Skill (single repo)

```bash
mkdir -p .claude/skills/my-skill
# Create .claude/skills/my-skill/SKILL.md with your skill content
```

The skill becomes available immediately in the next session (or after `/reload-plugins` in the current session).

### Directory Structure

```
~/.claude/skills/
  my-skill/
    SKILL.md          # Required — the skill definition
    helper.sh         # Optional — supporting scripts
    templates/        # Optional — supporting files
    scripts/          # Optional — executable scripts
```

## Method B: Via Plugins

Plugins bundle one or more skills and are distributed through marketplaces.

### Add a Marketplace

```
/plugin marketplace add <source>
```

Sources can be:
- **GitHub repo**: `anthropics/claude-code` or `my-org/my-plugins`
- **GitLab repo**: `gitlab:my-org/my-plugins`
- **Local file**: `/path/to/marketplace.json`
- **Remote URL**: `https://example.com/marketplace.json`

### Install a Plugin

```
/plugin install plugin-name@marketplace-name
```

Then reload to activate:

```
/reload-plugins
```

### Manage Installed Plugins

| Command | Effect |
|---|---|
| `/plugin disable plugin-name` | Temporarily disable a plugin |
| `/plugin enable plugin-name` | Re-enable a disabled plugin |
| `/plugin uninstall plugin-name` | Remove a plugin entirely |

### List Installed Plugins

```
/plugin → Installed tab
```

## When to Use Which Method

- **Standalone**: Best for personal utilities, project-specific workflows, quick experiments.
- **Plugins**: Best for sharing skills across teams, versioned distribution, bundling multiple related skills.
