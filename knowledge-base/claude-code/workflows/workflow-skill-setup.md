---
title: "Finding and setting up skills and plugins for Claude Code"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/skills"
last_verified: "2026-03-22"
content_hash: ""
---

# Setting Up Skills and Plugins for Claude Code

Skills extend Claude Code with specialized capabilities — custom commands, automated workflows, and domain-specific knowledge. Setting up the right skills per project improves task quality.

## Step-by-Step Setup

### Step 1: Check built-in skills

Inside Claude Code, run:

```
/help
```

This lists all currently available slash commands and built-in skills.

### Step 2: Browse the plugin marketplace

```
/plugin
```

Select "Discover" to browse available plugins from configured marketplaces.

### Step 3: Add marketplaces

Add the official Anthropic marketplace and any third-party sources:

```
/plugin marketplace add anthropics/claude-code
```

### Step 4: Install useful plugins

```
/plugin install commit-commands@anthropics/claude-code
/plugin install pr-review-toolkit@anthropics/claude-code
```

Plugins are installed globally and available across all projects.

### Step 5: Create project-specific skills

For project-specific workflows, create a skill manually:

```bash
mkdir -p ~/Code/my-project/.claude/skills/deploy
```

Create `~/Code/my-project/.claude/skills/deploy/SKILL.md`:

```markdown
---
description: "Deploy the application to staging or production"
---

# Deploy Skill

When the user asks to deploy:

1. Run tests first: `npm run test`
2. Build the project: `npm run build`
3. Ask which environment: staging or production
4. For staging: `npm run deploy:staging`
5. For production: confirm with user first, then `npm run deploy:prod`

Always verify the build succeeds before deploying.
```

The `description` field in frontmatter enables auto-invocation — Claude Code will use this skill automatically when the user's request matches the description.

### Step 6: Test skills manually

Invoke a skill explicitly to verify it works:

```
/deploy
```

Check that it follows the instructions in SKILL.md.

### Step 7: Verify auto-invocation

For skills with a `description` field, test by asking naturally:

```
"Deploy the app to staging"
```

Claude Code should automatically invoke the deploy skill without explicit `/deploy`.

## Recommended Skills by Project Type

### All Projects

| Skill | Purpose |
|-------|---------|
| `commit-commands` | Standardized commit messages and workflows |

### Web Projects (React, Next.js, Vue)

| Skill | Purpose |
|-------|---------|
| `frontend-design` | UI/UX guidance and component patterns |
| `commit-commands` | Commit workflow |

### API Projects (Express, FastAPI, Django)

| Skill | Purpose |
|-------|---------|
| `claude-api` | API design patterns and documentation |
| `commit-commands` | Commit workflow |

### PR Workflow

| Skill | Purpose |
|-------|---------|
| `pr-review-toolkit` | Automated PR review and feedback |
| `commit-commands` | Commit workflow |

## Example: Full Skill Setup for a React Native Project

```bash
# 1. Install global plugins
claude
/plugin marketplace add anthropics/claude-code
/plugin install commit-commands@anthropics/claude-code

# 2. Create project skill for EAS builds
mkdir -p ~/Code/meus/.claude/skills/eas-build
cat > ~/Code/meus/.claude/skills/eas-build/SKILL.md << 'SKILL'
---
description: "Build the app with EAS Build for iOS or Android"
---
# EAS Build Skill
1. Check which platform: ios, android, or both
2. Check which profile: development, preview, or production
3. Run: `eas build --platform [platform] --profile [profile]`
4. Monitor build status with: `eas build:list --limit 1`
SKILL

# 3. Test it
claude
> Build the app for iOS preview
# Should auto-invoke the eas-build skill
```
