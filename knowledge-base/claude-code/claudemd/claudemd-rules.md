---
title: "CLAUDE.md rules system"
category: "claudemd"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# Rules System (.claude/rules/)

Rules are specialized CLAUDE.md files that can load conditionally based on which files Claude accesses.

## Location

- Project rules: `.claude/rules/*.md`
- User rules: `~/.claude/rules/*.md`
- Symlinks are supported in `.claude/rules/`

## Unconditional Rules

A rule file without `paths` frontmatter loads every time, just like a regular CLAUDE.md:

```markdown
# Code Style

- Use 2-space indentation
- Prefer named exports over default exports
```

## Conditional Rules (Path-Scoped)

Add `paths` frontmatter with glob patterns. The rule only loads when Claude reads a file matching one of the patterns:

```yaml
---
paths: ["src/api/**/*.ts"]
---

# API Route Conventions

- Every route handler must validate input with zod
- Return { data: T } on success, { error: string } on failure
- Always set appropriate HTTP status codes
- Log errors with the structured logger, never console.log
```

This rule only activates when Claude touches files under `src/api/`.

## More Examples

### Database migration rules
```yaml
---
paths: ["prisma/**", "drizzle/**", "src/db/**"]
---

# Database Rules

- Never drop columns in production migrations — mark deprecated first
- Always add indexes for foreign keys
- Test migrations with `pnpm db:migrate:dry`
```

### Test-specific rules
```yaml
---
paths: ["**/*.test.ts", "**/*.spec.ts"]
---

# Testing Rules

- Use vitest, not jest
- Prefer `test()` over `it()`
- Mock external services, never hit real APIs in tests
```

## Excluding CLAUDE.md Files

Use `claudeMdExcludes` in your settings.json to skip specific files:

```json
{
  "claudeMdExcludes": ["**/vendor/CLAUDE.md", "**/legacy/CLAUDE.md"]
}
```

This prevents those files from loading even if Claude accesses files in those directories. Note: managed CLAUDE.md files (org-wide) cannot be excluded.
