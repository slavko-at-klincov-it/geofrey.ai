---
title: "Permission rule syntax and pattern matching"
category: "permissions"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/permissions"
last_verified: "2026-03-22"
content_hash: ""
---

# Permission Rule Syntax

Permission rules follow the format `ToolName(pattern)`. They are placed in `permissions.allow`, `permissions.deny`, or `permissions.ask` arrays in settings.

## Bash Rules

### Exact command match
```
Bash(npm run build)
```
Only matches the exact command `npm run build`.

### Prefix match with wildcard
```
Bash(npm *)
```
Matches any command starting with `npm `. The space before `*` acts as a word boundary, so `npm run test`, `npm install`, etc. all match.

**Important:** `Bash(npm*)` (no space) would also match `npmx` or `npm-cli`. Use `Bash(npm *)` with a space to match only commands where `npm` is the first word.

### Multiple commands
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(ls *)",
      "Bash(cat *)"
    ]
  }
}
```

## File Path Rules (Read, Edit, Write)

### CWD-relative path
```
Read(.env*)
```
Matches `.env`, `.env.local`, `.env.production` in the current working directory.

### Project-relative recursive
```
Read(/src/**)
```
The leading `/` means project root. `**` matches any depth of subdirectories.

```
Edit(/src/**)
Write(/src/**)
```

### Home directory
```
Read(~/.zshrc)
Read(~/.config/*)
```
The `~` expands to the user's home directory.

### Absolute filesystem path
```
Read(//tmp/file)
Read(//var/log/app.log)
```
Double leading slash `//` means absolute filesystem path (not project-relative).

### Wildcard patterns
```
Read(*.md)        # any .md file in CWD
Read(/src/**/*.ts) # any .ts file under /src recursively
Edit(*.test.ts)   # any test file in CWD
```

## Web Fetch Rules

### Domain match
```
WebFetch(domain:example.com)
```
Allows fetching from the specified domain.

```json
{
  "permissions": {
    "allow": [
      "WebFetch(domain:github.com)",
      "WebFetch(domain:npmjs.org)",
      "WebFetch(domain:docs.anthropic.com)"
    ]
  }
}
```

## MCP Tool Rules

MCP tools use the format `mcp__servername__toolname`:

```json
{
  "permissions": {
    "allow": [
      "mcp__filesystem__read_file",
      "mcp__github__list_issues",
      "mcp__slack__send_message"
    ]
  }
}
```

Wildcards work too:
```
mcp__github__*
```

## Agent Rules

Control which subagent types can be spawned:

```
Agent(Explore)
Agent(code)
```

## Skill Rules

Control which skills can be invoked:

```
Skill(deploy *)
Skill(review-pr)
```

## Glob and Grep Rules

```
Glob(*)     # allow all glob searches
Grep(*)     # allow all grep searches
```

## Complete Example

```json
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "Edit(/src/**)",
      "Write(/src/**)",
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(node *)",
      "WebFetch(domain:github.com)"
    ],
    "deny": [
      "Read(.env*)",
      "Read(~/.ssh/*)",
      "Read(~/.aws/*)",
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Edit(.claude/*)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(git commit *)",
      "Write(*.json)"
    ]
  }
}
```

## Rule Matching Notes

- Rules are matched top-down within each category (allow, deny, ask)
- `*` alone means "match anything" for that tool
- Patterns are case-sensitive
- For Bash rules, the match is against the full command string
- For file rules, the match is against the file path as provided by Claude
