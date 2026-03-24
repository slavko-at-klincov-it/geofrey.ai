---
title: "Setting up a new project for Claude Code"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# Setting Up a New Project for Claude Code

A proper project setup ensures Claude Code understands your codebase, follows your conventions, and has the right permissions from day one.

## Step-by-Step Setup

### Step 1: Create the .claude/ directory

```bash
mkdir -p ~/Code/my-project/.claude
```

This directory holds all Claude Code configuration for the project.

### Step 2: Create CLAUDE.md in project root

Create `~/Code/my-project/CLAUDE.md` with essential project context:

```markdown
# Project Name

## Overview
Brief description of what this project does.

## Tech Stack
- Language: TypeScript
- Framework: Next.js 14
- Database: PostgreSQL with Prisma ORM
- Testing: Jest + React Testing Library

## Conventions
- Use functional components with hooks
- All API routes in app/api/
- Database migrations via `npx prisma migrate dev`

## Common Commands
- `npm run dev` — start development server
- `npm run test` — run all tests
- `npm run build` — production build
- `npm run lint` — run ESLint
```

### Step 3: Create .claude/settings.json for project permissions

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run test)",
      "Bash(npm run lint)",
      "Bash(npm run build)",
      "Bash(npx prisma migrate dev)",
      "Read",
      "Edit",
      "Glob",
      "Grep"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force)",
      "Bash(npm publish)",
      "Bash(curl *)"
    ]
  }
}
```

This file is committed to the repo so the whole team shares the same permissions.

### Step 4: Optionally create .claude/settings.local.json

For personal settings not shared with the team (add to `.gitignore`):

```json
{
  "permissions": {
    "allow": [
      "Bash(docker compose up)"
    ]
  }
}
```

### Step 5: Create .claude/rules/ for path-specific rules

```bash
mkdir -p ~/Code/my-project/.claude/rules
```

Example: `~/Code/my-project/.claude/rules/api-routes.md`

```markdown
When editing files in app/api/:
- Always validate request body with zod schemas
- Return proper HTTP status codes
- Include error handling with try/catch
```

Rules are automatically loaded when Claude Code works on matching paths.

### Step 6: Run `claude /init` to auto-generate CLAUDE.md

If starting from an existing codebase, let Claude Code analyze it:

```bash
cd ~/Code/my-project && claude /init
```

This scans the codebase and generates a CLAUDE.md with detected tech stack, conventions, and commands. Review and edit the output — it is a starting point, not final.

### Step 7: Install relevant skills/plugins

```bash
claude
# Inside Claude Code:
/plugin install commit-commands@anthropics/claude-code
```

## Examples by Project Type

### React Native Project

```markdown
# MyApp (React Native)
## Commands
- `npx expo start` — start Expo dev server
- `npm run test` — Jest tests
- `npx expo prebuild` — generate native code
## Conventions
- Navigation with expo-router
- State management with Zustand
- Styles with StyleSheet.create (no inline styles)
```

### Python Project

```markdown
# DataPipeline (Python)
## Commands
- `poetry run pytest` — run tests
- `poetry run ruff check .` — linting
- `poetry run mypy .` — type checking
## Conventions
- Type hints on all functions
- Pydantic models for data validation
- Async with asyncio where possible
```

### Static Website

```markdown
# Portfolio (Static Site)
## Commands
- `npm run dev` — Astro dev server
- `npm run build` — build to dist/
## Conventions
- Pages in src/pages/
- Components in src/components/
- Images optimized before adding
```
