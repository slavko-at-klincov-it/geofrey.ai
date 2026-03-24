---
title: "Notable Plugin Skills"
category: "skills"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Notable Plugin Skills

These are widely used plugin skills available through marketplaces.

## Development Workflow Plugins

### commit-commands

Git workflow automation: commit, push, and PR creation with conventional commit messages and smart defaults.

```
/plugin install commit-commands@anthropics/claude-code
```

### pr-review-toolkit

PR review agents that analyze diffs, check for common issues, and generate structured review comments.

```
/plugin install pr-review-toolkit@anthropics/claude-code
```

### agent-sdk-dev

Tools and reference for developing with the Claude Agent SDK.

```
/plugin install agent-sdk-dev@anthropics/claude-code
```

### plugin-dev

Toolkit for developing and testing Claude Code plugins and skills.

```
/plugin install plugin-dev@anthropics/claude-code
```

## Output Style Plugins

### explanatory-output-style

Educational response style — Claude explains its reasoning and teaches concepts as it works.

```
/plugin install explanatory-output-style@anthropics/claude-code
```

### learning-output-style

Interactive learning mode — Claude asks questions and guides the user through problem-solving.

```
/plugin install learning-output-style@anthropics/claude-code
```

## Integration Plugins

These connect Claude Code to external services:

| Plugin | Service | Use Case |
|---|---|---|
| `github` | GitHub | Issues, PRs, actions, repo management |
| `gitlab` | GitLab | Merge requests, pipelines, issues |
| `slack` | Slack | Send messages, read channels |
| `sentry` | Sentry | Error tracking, issue investigation |
| `figma` | Figma | Design specs, component inspection |
| `vercel` | Vercel | Deployments, environment management |
| `firebase` | Firebase | Database, auth, hosting management |
| `linear` | Linear | Issue tracking, project management |
| `asana` | Asana | Task and project management |
| `notion` | Notion | Documentation, database queries |

### Installing Integration Plugins

```
/plugin install github@anthropics/claude-code
/plugin install slack@anthropics/claude-code
/plugin install linear@anthropics/claude-code
```

Most integration plugins require authentication configuration after installation. Follow the setup instructions provided by each plugin.

## Finding More Plugins

Browse available plugins in configured marketplaces:

```
/plugin → Discover tab
```

Or add a new marketplace to expand your options:

```
/plugin marketplace add my-org/plugins
```
