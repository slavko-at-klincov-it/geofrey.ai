---
title: "Quality Gates Pattern"
category: "workflows"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Quality Gates Pattern

## Concept

Quality gates are pre-execution checks that validate a Claude Code command before it runs. They catch common mistakes (missing scope, missing budget) and dangerous patterns (rm -rf, force push, secrets in prompts).

## gstack's Quality Gates

gstack enforces quality gates before shipping code:
- Test coverage: <60% blocks shipping, 60-80% shows warnings, >80% passes
- Plan completion: verifies all actionable items in the plan are addressed in diffs
- Review staleness: reviews older than 7 days are flagged
- Multi-tier review: eng-review gates shipping (required), CEO/Design reviews are informational

## Implementation for CLI Orchestrators

For a local orchestrator generating Claude Code commands, validate:

### Critical (Block Execution)
1. **--cwd present and valid**: Every command must be scoped to a project directory
2. **--max-budget-usd present**: Every command needs a budget limit
3. **Command is a claude command**: Basic sanity check

### Advisory (Warn, User Can Override)
4. **Dangerous patterns in prompt**: rm -rf, drop table, force push, --force
5. **Secrets in prompt**: password, api_key, secret_key, access_token
6. **Model appropriateness**: opus for simple tasks is wasteful, haiku for complex ones is insufficient

## Gate Result Format

```
Quality gate issues:
  [BLOCK] Missing --cwd (project scope)
  [BLOCK] Missing --max-budget-usd (budget limit)
  [WARN] Dangerous pattern: recursive delete (rm -rf)

BLOCKED: Fix critical issues above before executing.
```

Critical issues block execution entirely. Warnings let the user proceed with confirmation.
