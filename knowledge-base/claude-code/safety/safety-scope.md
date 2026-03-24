---
title: "Scoping Claude Code to the correct project directory"
category: "safety"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Scoping Claude Code to the Correct Project Directory

ALWAYS scope Claude Code to a specific project directory. Running Claude Code from the wrong directory can result in edits to wrong files, accidental deletions, or exposure of unrelated projects.

## Use --cwd to Set Working Directory

```bash
# Correct: specify the project directory
claude -p "Fix the login bug" --cwd ~/Code/my-project/

# Wrong: running from home directory
cd ~
claude -p "Fix the login bug"  # Which project? Claude Code sees everything.
```

The `--cwd` flag sets where Claude Code operates. All file operations (Read, Edit, Write, Bash) are relative to this directory.

## Never Run From ~ or /

Running Claude Code from your home directory or root gives it access to:
- All your projects (could edit the wrong one)
- Config files (~/.bashrc, ~/.zshrc, ~/.gitconfig)
- Sensitive directories (~/.ssh, ~/.aws)
- System files (if running from /)

Always target a specific project directory.

## Project-Specific Settings

Each project should have its own `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npx *)",
      "Read",
      "Edit",
      "Write"
    ],
    "deny": [
      "Read(.env*)",
      "Bash(rm -rf *)"
    ]
  }
}
```

This file lives at `<project-root>/.claude/settings.json` and applies only when Claude Code runs in that project.

## Additional Directories

When Claude Code needs access to files outside its working directory (e.g., shared libraries), use `--add-dir`:

```bash
claude -p "Update the shared utils" \
  --cwd ~/Code/my-app/ \
  --add-dir ~/Code/shared-libs/
```

Or configure in settings:

```json
{
  "additionalDirectories": [
    "~/Code/shared-libs"
  ]
}
```

Use this sparingly. Every additional directory expands Claude Code's access scope.

## Verification Before Execution

When orchestrating Claude Code programmatically, verify the cwd before spawning:

```javascript
const path = require('path');
const fs = require('fs');

function launchClaudeCode(task, projectDir) {
  // Verify the directory exists and is a project
  if (!fs.existsSync(path.join(projectDir, 'package.json')) &&
      !fs.existsSync(path.join(projectDir, '.git'))) {
    throw new Error(`Not a project directory: ${projectDir}`);
  }

  // Verify the task matches the project (basic check)
  const projectName = path.basename(projectDir);
  console.log(`Running task in project: ${projectName}`);

  return spawn('claude', ['-p', task, '--cwd', projectDir]);
}
```

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Running from ~ | Claude Code sees all projects | Use --cwd |
| No .claude/settings.json | No project-specific deny rules | Create per-project settings |
| Too many --add-dir | Expanded blast radius | Minimize additional dirs |
| Relative paths in tasks | Ambiguous file references | Use absolute paths or ensure correct cwd |
| Reusing one session for multiple projects | Cross-project contamination | One session per project |

## For Maestro Orchestration

When spawning multiple Claude Code sessions:

1. Always pass `--cwd` with the exact project directory
2. Validate the directory exists before spawning
3. Never share a session across projects
4. Log which directory each session operates in for audit
