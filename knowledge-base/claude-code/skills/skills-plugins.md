---
title: "Plugin System: Bundled Skills, Agents, Hooks, and MCP Servers"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Plugin System

Plugins are bundles that package multiple skills, agents, hooks, and MCP servers together. They differ from standalone skills by providing a complete, installable capability set.

## Installing and Managing Plugins

```bash
# Install a plugin
/plugin install typescript-tools@community

# Browse available plugins
/plugin
# Then select the Discover tab

# Other management commands
/plugin enable <name>
/plugin disable <name>
/plugin uninstall <name>
/plugin update <name>

# Apply changes without restarting
/reload-plugins
```

## Plugin Structure

A plugin is a directory containing any combination of:

```
my-plugin/
  skills/       # SKILL.md files
  agents/       # Agent definitions
  hooks/        # Hook scripts
  lsp/          # LSP servers for code intelligence
```

## Namespacing

Plugins are namespaced to prevent conflicts between skills from different plugins:

```
/plugin-name:skill-name
```

For example, a `typescript-tools` plugin with a `refactor` skill is invoked as `/typescript-tools:refactor`.

## Marketplaces

Plugins come from marketplaces — curated sources of trusted plugins.

```bash
# Add a custom marketplace
/plugin marketplace add https://github.com/my-org/claude-plugins

# Restrict to known marketplaces only (managed settings)
# Set strictKnownMarketplaces: true
```

Marketplace sources can be: GitHub repos, GitLab repos, local file paths, or remote URLs.

## Code Intelligence Plugins

Language-specific plugins (TypeScript, Python, Go, Rust) bundle LSP servers that give Claude faster, more accurate code navigation — jump-to-definition, find-references, and type information without reading entire files.

## Trust Model

On first install, Claude shows a trust warning with the plugin's source and permissions. You must explicitly approve before the plugin activates.

## Key Points

- Plugins bundle multiple capabilities; standalone skills are single SKILL.md files.
- Use `/reload-plugins` after enabling/disabling to apply changes in the current session.
- Namespacing (`/plugin:skill`) prevents name collisions across plugins.
- For managed environments, `strictKnownMarketplaces` restricts where plugins can be installed from.
