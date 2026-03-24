---
title: "Source registry configuration for knowledge base updates"
category: "self-maintenance"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code"
last_verified: "2026-03-22"
content_hash: ""
---

# Source Registry (sources_registry.yaml)

The source registry is the central configuration that tells the update pipeline which sources to monitor and which knowledge chunks they map to. It lives at `config/sources_registry.yaml`.

## Full Registry Structure

```yaml
sources:
  # Official documentation pages
  - url: "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
    type: "official_docs"
    maps_to: ["cli/*.md"]
    check_frequency: "daily"

  - url: "https://docs.anthropic.com/en/docs/claude-code/skills"
    type: "official_docs"
    maps_to: ["skills/*.md"]
    check_frequency: "daily"

  - url: "https://docs.anthropic.com/en/docs/claude-code/hooks"
    type: "official_docs"
    maps_to: ["hooks/*.md"]
    check_frequency: "daily"

  - url: "https://docs.anthropic.com/en/docs/claude-code/settings"
    type: "official_docs"
    maps_to: ["settings/*.md", "permissions/*.md"]
    check_frequency: "daily"

  - url: "https://docs.anthropic.com/en/docs/claude-code/memory"
    type: "official_docs"
    maps_to: ["claudemd/*.md"]
    check_frequency: "daily"

  # Changelog and releases — for detecting new features
  - url: "https://docs.anthropic.com/en/docs/claude-code/changelog"
    type: "changelog"
    purpose: "detect new features and deprecations"
    check_frequency: "daily"

  - url: "https://github.com/anthropics/claude-code/releases"
    type: "releases"
    purpose: "release notes"
    check_frequency: "daily"

  # Version checks — local commands
  - command: "npm view @anthropic-ai/claude-code version"
    type: "version_check"
    purpose: "detect new versions available on npm"
    check_frequency: "daily"

  - command: "claude --version"
    type: "version_check"
    purpose: "current installed version"
    check_frequency: "daily"
```

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes (for web sources) | The URL to fetch and hash |
| `command` | Yes (for command sources) | Shell command to run |
| `type` | Yes | One of: `official_docs`, `changelog`, `releases`, `version_check` |
| `maps_to` | For `official_docs` | Glob patterns of knowledge chunks this source updates |
| `purpose` | For non-docs types | Human-readable description of why this source is monitored |
| `check_frequency` | No | How often to check: `daily` (default), `weekly`, `hourly` |

## How to Add a New Source

### 1. Identify the documentation URL

Find the official page for the feature on docs.anthropic.com.

### 2. Add entry to sources_registry.yaml

```yaml
  - url: "https://docs.anthropic.com/en/docs/claude-code/new-feature"
    type: "official_docs"
    maps_to: ["new-feature/*.md"]
    check_frequency: "daily"
```

### 3. Specify the maps_to field

Use glob patterns relative to `knowledge/`. This tells the pipeline which chunks to update when this source changes.

### 4. Run the update script manually to test

```bash
./scripts/update_knowledge.sh --source "https://docs.anthropic.com/en/docs/claude-code/new-feature" --dry-run
```

The `--dry-run` flag shows what would change without modifying files.

### 5. Verify the mapping works

Check that the correct chunks are identified for update:

```bash
./scripts/update_knowledge.sh --source "https://docs.anthropic.com/en/docs/claude-code/new-feature" --list-affected
```

## Tips

- Use `maps_to` with specific patterns (e.g., `["hooks/hooks-overview.md"]`) rather than broad globs when a source maps to only one chunk.
- For changelog/release sources, `maps_to` is not used — instead, the pipeline scans for new features and creates chunks dynamically.
- Version check commands must return a single version string to be hashable.
