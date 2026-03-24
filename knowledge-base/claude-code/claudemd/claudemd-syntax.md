---
title: "CLAUDE.md syntax and formatting"
category: "claudemd"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# CLAUDE.md Syntax and Format

CLAUDE.md files use standard Markdown with a few Claude Code-specific features.

## Basic Format

Plain Markdown. Use headers and bullets to organize instructions clearly.

```markdown
# Project: My App

## Tech Stack
- TypeScript with Node.js 20
- PostgreSQL 16 with Drizzle ORM
- React 19 frontend

## Conventions
- Use `pnpm` for package management
- Run tests with `pnpm test`
- All API routes go in `src/api/`
```

## Imports

Pull in content from other files using the `@` syntax:

```markdown
@docs/architecture.md
@~/global-rules/formatting.md
```

- Paths resolve relative to the importing file
- `@~/` resolves to the user's home directory
- Maximum 5 levels of nesting (imports within imports)
- Imported content is inlined at the point of the `@` reference

## Rules Frontmatter

Files in `.claude/rules/` support optional YAML frontmatter with a `paths` field:

```yaml
---
paths: ["src/api/**/*.ts", "src/api/**/*.test.ts"]
---

# API Conventions
- All endpoints return JSON with { data, error } shape
- Use zod for request validation
```

Without `paths`, the rule loads unconditionally.

## Writing Guidelines

- Be specific and concrete: "Use vitest, not jest" beats "Use the right test framework"
- Keep each file under 200 lines — Claude loads the first 200 lines of auto-memory per session
- Use headers to separate topics so Claude can locate instructions quickly
- Content is re-injected fresh after compaction, so instructions survive long sessions
- One instruction per bullet point for clarity

## Example: Concise, Effective CLAUDE.md

```markdown
# My SaaS App

## Stack
- Next.js 15 App Router, TypeScript strict mode
- Prisma + PostgreSQL
- Tailwind CSS + shadcn/ui

## Commands
- Dev: `pnpm dev`
- Test: `pnpm vitest run`
- Lint: `pnpm eslint . --fix`
- Type check: `pnpm tsc --noEmit`

## Rules
- Never use `any` — use `unknown` and narrow
- Components in `src/components/`, pages in `src/app/`
- All DB changes need a migration: `pnpm prisma migrate dev`
```
