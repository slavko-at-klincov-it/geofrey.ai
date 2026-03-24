---
title: "Discovering Available Skills"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Discovering Available Skills

## In-Session Discovery

### Slash Command Autocomplete

Type `/` in a Claude Code session to see an autocomplete list of all available skills. Continue typing to filter:

```
/ <tab>         → shows all available skills
/com <tab>      → filters to skills starting with "com" (e.g., commit)
```

### Help Command

Run `/help` to see all available commands, including installed skills.

## Plugin Marketplace

### Browse the Marketplace

Use the Discover tab within the plugin interface:

```
/plugin → Discover tab
```

This shows skills available for installation from configured marketplaces.

### Add a Marketplace

Marketplaces are GitHub repos (or other sources) that index available plugins:

```
/plugin marketplace add anthropics/claude-code
```

This adds the official demo marketplace. You can add any GitHub repo that follows the marketplace format:

```
/plugin marketplace add my-org/my-marketplace
```

### Install from Marketplace

Once a marketplace is added, install plugins from it:

```
/plugin install plugin-name@marketplace-name
```

## Check Installed Skills

Skills are stored in predictable locations. Check these directories:

```
~/.claude/skills/          # Global (personal) skills
.claude/skills/            # Project-level skills
```

Each skill is a subdirectory containing a `SKILL.md` file.

## Additional Sources

- **--add-dir directories**: Skills from directories added via the `--add-dir` flag are loaded automatically.
- **Monorepos**: Nested `.claude/skills/` directories are discovered within monorepo structures.
