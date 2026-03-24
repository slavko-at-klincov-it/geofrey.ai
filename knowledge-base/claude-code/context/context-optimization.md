---
title: "Optimizing context window usage"
category: "context"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# Context Optimization

The context window is a finite resource. These strategies help you use it efficiently and avoid hitting limits during complex tasks.

## Move Verbose Instructions to Skills

Skills load on demand, not at startup. Move rarely-needed instructions out of CLAUDE.md into skills:

```
# Before: CLAUDE.md bloated with 150 lines of deployment instructions

# After: CLAUDE.md has 5 lines
## Deployment
Use the /deploy skill for deployment procedures.
```

The deployment instructions only load when someone invokes `/deploy`, saving context for actual coding work.

## Use Subagents for Heavy Operations

Subagents get their own context windows. Offload high-output operations to them:

- Codebase exploration (spawns Explore agent with Haiku — cheap, separate context)
- Research tasks (Plan agent reads many files without bloating your context)
- Independent subtasks (general-purpose agent handles them in isolation)

When a subagent finishes, only a summary returns to your main context — not all the files it read.

## Use Hooks to Offload Processing

Hooks run outside the context window entirely. Use them for:

- Linting after edits (don't need Claude to see lint output unless there are errors)
- Running tests automatically (only inject failures into context)
- Formatting code (no context cost at all)

## Install Code Intelligence Plugins

Language-specific plugins (LSP, tree-sitter) reduce the need for Claude to read entire files to understand structure. This saves context that would otherwise be spent on exploration.

## Compact Proactively

Don't wait for auto-compaction at 95%. Compact between task phases:

```
# Phase 1: Research complete
/compact keep findings about the auth module dependencies

# Phase 2: Implementation with full context available
> Now implement the changes
```

## Limit Runaway Sessions

### Max turns in print mode
```bash
claude -p "fix the tests" --max-turns 10
```
Prevents infinite loops that consume context.

### Budget cap
```bash
claude --max-budget-usd 5.00
```
Stops the session when spending reaches the limit, which correlates with context usage.

## Context-Efficient Prompting

### Be specific about what you need
Bad: "Look at the codebase and tell me about the architecture"
Good: "Read src/api/routes.ts and src/db/schema.ts, then explain how API routes map to database tables"

### Reference files by path
Bad: "Find the authentication middleware"
Good: "Read src/middleware/auth.ts"

### Break large tasks into focused sessions
Instead of one massive session that hits compaction repeatedly, split work:
1. Session 1: Plan the refactoring
2. Session 2: Implement module A
3. Session 3: Implement module B
4. Session 4: Update tests

Each session starts fresh with full context available.
