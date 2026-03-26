---
title: "Diff Scope Detection Pattern"
category: "workflows"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Diff Scope Detection Pattern

## Concept

Before generating a Claude Code command, detect what kinds of files have changed in a project. This lets the orchestrator tailor the command (model choice, budget, focus areas).

## gstack's 6-Scope Model

gstack categorizes file changes into boolean scopes:
- **Frontend**: CSS/SCSS, JSX/TSX, templates, component directories
- **Backend**: Language source files, non-component JS
- **Prompts**: Generation/writing/voice services
- **Tests**: Test files and directories
- **Docs**: Markdown files
- **Config**: Dependencies and config formats

Exports as `SCOPE_FRONTEND=true`, `SCOPE_BACKEND=true`, etc. for downstream tooling.

## Practical Application

When an orchestrator knows the scope of pending changes:

| Scope | Implication |
|---|---|
| Frontend only | Use sonnet (visual/layout work), lower budget |
| Backend only | sonnet for fixes, opus for architecture |
| Tests only | sonnet, focus on coverage gaps |
| Mixed frontend+backend | Higher budget, more turns |
| Security-relevant (config, backend) | Consider opus, add security review step |

## Implementation

1. Run `git diff --name-only HEAD` + `git ls-files --others --exclude-standard`
2. Classify each file by extension and path patterns
3. Tests take priority (test_foo.py is "tests", not "backend")
4. Inject one-line summary into orchestrator context: "Pending changes: backend: 5 files, tests: 2 files"
