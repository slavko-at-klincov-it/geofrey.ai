---
title: "Best practices for writing CLAUDE.md"
category: "claudemd"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# Best Practices for CLAUDE.md

## What to Include

- **Project conventions:** naming patterns, file organization, import style
- **Tech stack:** framework versions, key libraries, runtime requirements
- **Common commands:** build, test, lint, deploy — exact commands Claude should run
- **Testing approach:** test framework, where tests live, how to run them
- **Architecture decisions:** patterns used (DDD, hexagonal, etc.), why they were chosen
- **Team preferences:** formatting rules, PR conventions, commit message format

## What NOT to Include

- Things Claude can derive from the code (e.g., "this project uses TypeScript" when there's a tsconfig.json)
- Obvious patterns already enforced by linters
- Secrets, passwords, API keys, or tokens
- Extremely long documentation — move it to imported files or skills instead

## Writing Style

### Be specific, not vague

Bad:
```markdown
- Write clean code
- Follow best practices
- Use proper error handling
```

Good:
```markdown
- Use early returns to reduce nesting
- Wrap external API calls in try/catch, log with structuredLog()
- All functions must have explicit return types
```

### Use headers to organize

Claude scans headers to find relevant instructions. Group by topic:

```markdown
## Git Workflow
- Create feature branches from `main`
- Squash commits before merging

## Error Handling
- Use custom AppError class from src/lib/errors.ts
- Never swallow errors silently
```

## Size Guidelines

- Keep each CLAUDE.md under 200 lines
- The first 200 lines of auto-memory (MEMORY.md) load per session
- Move verbose or rarely-needed instructions into skills (loaded on demand)
- Use `.claude/rules/` for path-specific instructions to avoid bloating the main file

## Use Rules for Scoped Instructions

Instead of putting everything in one CLAUDE.md, split context-specific instructions into rules:

```
CLAUDE.md                          # 50 lines: stack, commands, global conventions
.claude/rules/
  frontend.md                      # paths: ["src/app/**"] — React patterns
  api.md                           # paths: ["src/api/**"] — API conventions
  database.md                      # paths: ["src/db/**"] — migration rules
```

This keeps the base CLAUDE.md lean and loads extra context only when relevant.

## Use Imports for Shared Content

If multiple projects share conventions, put them in a central file and import:

```markdown
# Project-Specific Instructions
@~/shared-rules/typescript.md
@~/shared-rules/git-workflow.md

## This Project
- Uses pnpm workspaces with 3 packages
- Deploy with `pnpm deploy:staging`
```
