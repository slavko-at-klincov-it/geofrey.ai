---
title: "Claude Code in GitHub Actions and CI"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/github-actions"
last_verified: "2026-03-22"
content_hash: ""
---

# Claude Code in GitHub Actions / CI

Integrate Claude Code directly into your CI/CD pipeline. Claude can review PRs, fix failing builds, and create merge requests automatically.

## Core Capabilities

- **Respond to @claude comments** on PRs — Claude reads context and replies
- **Auto-fix failing CI** — Claude detects failures, reads logs, pushes a fix
- **Create PRs from issues** — assign an issue to Claude, it creates a PR with the fix
- **Automated code review** — Claude reviews every push against your REVIEW.md standards
- **Auto-merge** — merge PRs automatically when all checks pass

## Responding to @claude on PRs

When someone comments `@claude fix the type errors` on a PR, Claude:

1. Reads the PR diff and context
2. Understands the request
3. Pushes a commit with the fix

## Auto-Fix CI Failures

Enable the auto-fix toggle so Claude attempts to fix CI failures:

1. CI fails on a push or PR
2. Claude reads the failure logs
3. Claude identifies the root cause
4. Claude pushes a fix commit
5. CI re-runs automatically

## Code Review with REVIEW.md

Create a `REVIEW.md` file in your repo root with review criteria. Claude uses it to review every PR:

```markdown
# Review Criteria
- No console.log statements in production code
- All public functions must have JSDoc comments
- No hardcoded secrets or API keys
- Test coverage for new functions
```

## Example GitHub Actions Workflow

```yaml
name: Claude Code Review
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          auto_fix: true
          auto_merge: false
```

## GitLab CI/CD

Claude Code also supports GitLab CI/CD pipelines with similar capabilities — respond to comments, auto-fix, and review MRs.

## Toggles

| Toggle | Effect |
|--------|--------|
| `auto_fix: true` | Claude attempts to fix CI failures automatically |
| `auto_merge: true` | Merge PR when all checks pass |
| `review: true` | Review every PR against REVIEW.md |

## Best Practices

- Start with `auto_fix: false` and review Claude's suggestions manually
- Use `REVIEW.md` to encode your team's standards
- Set budget limits in the action config to control costs
- Keep `auto_merge: false` until you trust the pipeline
