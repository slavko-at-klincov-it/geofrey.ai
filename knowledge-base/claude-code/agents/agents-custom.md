---
title: "Creating custom subagents"
category: "agents"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/sub-agents"
last_verified: "2026-03-22"
content_hash: ""
---

# Custom Subagents

Create specialized agents as Markdown files with YAML frontmatter.

## File Locations

- Project agents: `.claude/agents/*.md`
- User agents: `~/.claude/agents/*.md`

## Frontmatter Schema

```yaml
---
name: "reviewer"
description: "Reviews code for quality and security issues"
model: "claude-opus-4-6"
tools:
  - Read
  - Grep
  - Glob
disallowedTools:
  - Write
  - Edit
  - Bash
permissionMode: "bypassPermissions"
maxTurns: 10
effort: "high"
memory: "project"
isolation: "worktree"
skills:
  - "security-checklist"
mcpServers:
  - "github"
---
```

### Required Fields
- `name` — identifier used to invoke the agent
- `description` — what the agent does (shown in listings)

### Optional Fields
- `tools` — allowlist of tools the agent can use
- `disallowedTools` — denylist of tools the agent cannot use
- `model` — which model to use (defaults to current session model)
- `permissionMode` — permission handling behavior
- `maxTurns` — maximum conversation turns before stopping
- `skills` — skills to pre-load for this agent
- `mcpServers` — MCP servers to connect
- `hooks` — lifecycle hooks
- `memory` — persistence mode: `user`, `project`, or `local`
- `background` — run in background
- `effort` — thinking depth: low, medium, high, max
- `isolation` — set to `worktree` for git worktree isolation

## Memory Persistence

- `memory: user` — saves to `~/.claude/agent-memory/<name>/`
- `memory: project` — saves to `.claude/agent-memory/<name>/`
- `memory: local` — ephemeral, lost after session

## Invoking Custom Agents

```bash
# Natural language
"Ask the reviewer to check src/api/auth.ts"

# @mention
@reviewer check this file for SQL injection

# CLI flag
claude --agent reviewer

# In settings
{ "agent": "reviewer" }
```

## Example: Read-Only Research Agent

```yaml
---
name: "researcher"
description: "Explores codebase and answers questions without modifying files"
tools:
  - Read
  - Grep
  - Glob
  - WebSearch
effort: "medium"
maxTurns: 20
---

You are a research agent. Your job is to explore the codebase and answer
questions thoroughly. You MUST NOT modify any files. Provide detailed
findings with file paths and line numbers.
```

## Example: Test Writer Agent

```yaml
---
name: "test-writer"
description: "Writes comprehensive tests for specified modules"
model: "claude-sonnet-4-6"
disallowedTools:
  - Bash
memory: "project"
effort: "high"
---

You write tests. For each file you are asked to test:
1. Read the source file and understand its behavior
2. Check for existing tests
3. Write comprehensive tests covering happy path, edge cases, and errors
4. Use the project's existing test framework and patterns
```
