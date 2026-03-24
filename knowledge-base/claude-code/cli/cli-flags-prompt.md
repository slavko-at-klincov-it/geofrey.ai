---
title: "Claude Code System Prompt Customization Flags"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# System Prompt Customization Flags

These flags control the system prompt that Claude Code operates under. The system prompt defines Claude's behavior, constraints, and context for the session.

## `--system-prompt <text>`

**Replace** the entire default system prompt with custom text.

```bash
claude -p "implement the API endpoint" \
  --system-prompt "You are a backend engineer. Write Go code following the project conventions. Always write tests."
```

**Warning:** This removes Claude Code's entire default system prompt, including its built-in instructions for tool use, file editing, safety guidelines, and coding best practices. Only use this when you need complete control over Claude's behavior and understand what the defaults provide.

## `--system-prompt-file <path>`

Same as `--system-prompt` but loads the prompt text from a file. Useful for long or reusable prompts.

```bash
claude -p "implement the feature" \
  --system-prompt-file ./prompts/backend-engineer.txt
```

## `--append-system-prompt <text>`

**Append** text to the default system prompt. The default prompt remains intact, and your text is added after it.

```bash
claude -p "implement user registration" \
  --append-system-prompt "Follow the coding conventions in CONVENTIONS.md. Use the repository's existing patterns for error handling."
```

**This is the recommended approach for most use cases.** You get all of Claude Code's built-in capabilities (tool use, file editing, safety) plus your custom instructions.

## `--append-system-prompt-file <path>`

Same as `--append-system-prompt` but loads the text from a file.

```bash
claude -p "implement the feature" \
  --append-system-prompt-file ./prompts/project-conventions.txt
```

## Replace vs. Append: When to Use Each

| Approach | Use When |
|----------|----------|
| `--append-system-prompt` | You want Claude Code's default behavior plus additional instructions. **Use this by default.** |
| `--system-prompt` | You need complete control over the prompt. You are building a specialized agent that should not follow Claude Code's default patterns. |

For Maestro orchestration, `--append-system-prompt` is almost always the right choice. The default system prompt contains critical instructions for how Claude Code uses its tools, edits files safely, and handles errors. Replacing it means you need to replicate all of that yourself.

## Practical Examples

### Adding project context
```bash
claude -p "add pagination to the users endpoint" \
  --append-system-prompt "This is a Node.js/Express project using TypeScript. The database is PostgreSQL with Prisma ORM. Follow existing patterns in src/routes/ for endpoint structure."
```

### Role-specific behavior
```bash
claude -p "review this PR for security issues" \
  --append-system-prompt "You are a security reviewer. Focus on: SQL injection, XSS, authentication bypass, secrets in code, and insecure dependencies. Report findings with severity levels."
```

### Enforcing output constraints
```bash
claude -p "refactor the auth module" \
  --append-system-prompt "Do not modify any test files. Do not change public API signatures. Only refactor internal implementation details."
```

### Loading from a file for complex instructions
```bash
# prompts/maestro-worker.txt contains:
# - Project architecture overview
# - Coding conventions
# - Testing requirements
# - File organization rules

claude -p "implement feature X" \
  --append-system-prompt-file ./prompts/maestro-worker.txt
```

## Combining with CLAUDE.md

Claude Code automatically reads `CLAUDE.md` files from the project directory. These provide persistent project-level instructions. The system prompt flags add session-specific instructions on top.

The loading order is:
1. Default Claude Code system prompt (or replacement via `--system-prompt`)
2. `CLAUDE.md` files (project root, parent directories, subdirectories)
3. `--append-system-prompt` content

All three layers combine to form Claude's complete instruction set for the session.
