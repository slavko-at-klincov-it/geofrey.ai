---
title: "Document Release / Doc-Sync Pattern"
category: "workflows"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Document Release / Doc-Sync Pattern

## Problem

Code changes fast, documentation doesn't keep up. After a feature implementation or refactor, docs like README, architecture files, changelogs, knowledge base chunks, and project journals become stale. Two days later, Claude Code uses outdated docs as context and generates wrong code. The "snake in the grass" problem.

## gstack's Document Release Skill

gstack's `/document-release` skill runs a structured workflow after code changes:

1. **Find all diffs** — all files that changed since last commit/release
2. **Inventory documentation** — find all .md files, READMEs, architecture docs, changelogs, TODOs
3. **Cross-reference** — for each code change, check if any doc references that code and is now outdated
4. **Detect conflicts** — does the architecture doc still describe the old structure? Does the changelog mention the change?
5. **Auto-update** — update docs that are clearly stale (counts, paths, descriptions)
6. **Quiz on risky changes** — flag changes that might break assumptions in docs
7. **Clean up TODOs** — mark resolved TODOs as done
8. **Changelog consistency** — verify docs don't contradict each other
9. **Commit and version** — help manage the documentation commit

## When to Use Doc-Sync

- After implementing a new feature (new files, new commands, new config)
- After a refactor that changes file structure or module organization
- After deleting or renaming files
- Before a release or major commit
- When the knowledge base markdown files might be outdated
- When project-journal.md needs a new entry

## geofrey-Specific Documentation Files

For the geofrey project, these files need sync checking:
- `CLAUDE.md` — project structure, collection counts, tech stack
- `docs/vision.md` — phase checklists, feature status
- `docs/project-journal.md` — development log entries
- `docs/architecture.md` — technical architecture
- `config/config.yaml` — if new config sections were added
- `knowledge-base/claude-code/` — 110 knowledge chunks that reference specific features

## Claude Code Command Pattern

```bash
claude -p "Documentation sync: 1) Run git diff to find recent changes. 2) Read all .md files in docs/ and CLAUDE.md. 3) Cross-reference code changes against docs. 4) Update any stale references (file counts, paths, feature lists). 5) Add project-journal entry if missing. 6) Report what was updated." --cwd /path/to/project --model sonnet --max-turns 30 --max-budget-usd 2.00
```

## Key Principle

Documentation is an asset when current, a liability when stale. Automated doc-sync after code changes prevents the "outdated context → wrong code → debugging spiral" cycle.
