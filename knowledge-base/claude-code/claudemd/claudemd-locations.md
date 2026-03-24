---
title: "CLAUDE.md file locations and loading scope"
category: "claudemd"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/memory"
last_verified: "2026-03-22"
content_hash: ""
---

# CLAUDE.md File Locations

CLAUDE.md files provide persistent instructions to Claude Code. They load from multiple locations with different scopes.

## Location Hierarchy

### Managed (Organization-Wide)
- **macOS:** `/Library/Application Support/ClaudeCode/CLAUDE.md`
- **Linux:** `/etc/claude-code/CLAUDE.md`
- Highest priority — always loaded, cannot be excluded
- Set by IT/admins for org-wide policies

### Project-Level (Shared via Git)
- `./CLAUDE.md` in project root
- `./.claude/CLAUDE.md` in project root
- Committed to git so the whole team shares them
- Most common location for project instructions

### User-Level (Personal, All Projects)
- `~/.claude/CLAUDE.md`
- Applies to every project you open
- Good for personal preferences and global conventions

### Project Rules (Path-Specific)
- `.claude/rules/*.md`
- Each rule file can have a `paths` frontmatter to scope it to specific files
- Loaded conditionally based on which files Claude accesses

### User Rules (Personal, All Projects)
- `~/.claude/rules/*.md`
- Personal rules that apply everywhere

## Loading Order

1. Walk up from the current working directory, loading all ancestor `CLAUDE.md` files
2. Discover subdirectory `CLAUDE.md` files (lazy-loaded when Claude accesses files in that directory)
3. Load rules from `.claude/rules/` and `~/.claude/rules/`

## Example: Typical Project Setup

```
~/.claude/CLAUDE.md                  # Personal: "Use concise output"
my-project/
  CLAUDE.md                          # Project: tech stack, conventions
  .claude/
    rules/
      api-standards.md               # Rule: loads only for src/api/** files
      testing.md                     # Rule: loads for **/*.test.ts files
  backend/
    CLAUDE.md                        # Subdirectory: backend-specific instructions
```

When you `cd my-project` and start Claude Code, it loads your personal `~/.claude/CLAUDE.md` and the project root `CLAUDE.md`. If Claude then reads a file in `backend/`, it lazy-loads `backend/CLAUDE.md`. If it reads an API file matching the glob, it loads `api-standards.md`.
