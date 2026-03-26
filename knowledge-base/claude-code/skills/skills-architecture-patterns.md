---
title: "Skill Architecture Patterns"
category: "skills"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Skill Architecture Patterns

## Why Specialized Skills Beat One Monolithic Prompt

A single "do everything" system prompt forces the LLM to figure out what kind of task it's doing AND how to do it. Specialized skill templates separate these concerns:

1. **Task routing** happens before the LLM call (keyword matching, instant)
2. **Task execution** uses a focused prompt optimized for that task type

## gstack's 28-Skill Architecture (Reference)

gstack (by Garry Tan) implements 28 Claude Code skills, each as a `.md` template installed in `~/.claude/skills/`. Categories:

- **Planning:** office-hours, plan-ceo-review, plan-eng-review, plan-design-review
- **Code:** review (multi-tier with bug detection), codex (cross-model second opinions)
- **QA:** qa (browser testing + auto-fix), qa-only (report only), benchmark
- **Security:** cso (OWASP + STRIDE zero-noise audits)
- **Deployment:** ship (PR + quality gates), land-and-deploy (canary verification)
- **Safety:** careful (cautious mode), freeze/unfreeze, guard
- **Utilities:** retro, investigate, document-release, autoplan, upgrade

## Practical Implementation Pattern

For a local orchestrator (like geofrey with a 9B model), 6 task types cover 90% of use cases:

| Skill | Model | Budget | Key Flag |
|---|---|---|---|
| code-fix | sonnet | $2-5 | default |
| feature | sonnet | $3-5 | default |
| review | opus | $1-2 | --permission-mode plan |
| research | opus | $2-5 | --permission-mode plan |
| security | opus | $3-5 | --permission-mode plan |
| refactor | sonnet | $2-5 | default |

## Key Design Decisions

- **Keyword routing over LLM classification**: For small models, keyword matching is instant and deterministic. No context window cost.
- **Shared base rules**: Extract common syntax/safety rules into a reusable template fragment to avoid duplication across skills.
- **Fallback to generic**: Unknown task types fall back to the general orchestrator prompt.
