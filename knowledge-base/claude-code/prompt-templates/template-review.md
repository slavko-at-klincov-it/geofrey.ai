---
title: "Prompt template for code review tasks in Claude Code"
category: "prompt-templates"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Code Review Prompt Template

Use this template when Maestro needs to dispatch a read-only code review task to Claude Code. This template uses plan mode to ensure no files are modified.

## Template

```bash
claude -p "$(cat <<'EOF'
Review the recent changes in this project. Focus on:
- Security vulnerabilities
- Performance issues
- Code quality
- Missing tests
- Error handling gaps
Report findings but do NOT make changes.
EOF
)" \
  --cwd [project_path] \
  --model opus \
  --permission-mode plan \
  --max-turns 20 \
  --allowedTools "Read,Grep,Glob,Bash(git diff),Bash(git log --oneline -20)"
```

## Filled Example: Review Recent Commits

```bash
claude -p "$(cat <<'EOF'
Review the changes from the last 5 commits in this project. Focus on:
- Security vulnerabilities (SQL injection, XSS, auth bypasses)
- Performance issues (N+1 queries, unnecessary re-renders, missing indexes)
- Code quality (dead code, unclear naming, missing types)
- Missing tests for new functionality
- Error handling gaps (unhandled promises, missing try/catch)
Report findings as a prioritized list: critical, warning, suggestion.
Do NOT make any changes.
EOF
)" \
  --cwd ~/Code/meus/ \
  --model opus \
  --permission-mode plan \
  --max-turns 20 \
  --allowedTools "Read,Grep,Glob,Bash(git diff HEAD~5),Bash(git log --oneline -20)"
```

## Filled Example: Review a Specific File

```bash
claude -p "$(cat <<'EOF'
Review src/services/auth.ts for:
- Security: token handling, password hashing, session management
- Are there any hardcoded secrets?
- Is input validation sufficient?
- Are errors handled properly?
Report findings but do NOT make changes.
EOF
)" \
  --cwd ~/Code/meus/ \
  --model opus \
  --permission-mode plan \
  --max-turns 15
```

## Usage Notes

- **Use plan mode** (`--permission-mode plan`). This is critical for reviews — it prevents Claude Code from modifying any files. It can only read and report.
- **Use Opus**, not Sonnet. Code review benefits from deeper reasoning. Opus catches subtle security issues and architectural problems that Sonnet may miss.
- **Fewer turns needed.** Reviews are read-heavy, not write-heavy. 15-20 turns is sufficient.
- **No budget flag needed** for plan mode, as it uses fewer tokens than write operations. Add `--max-budget-usd 1.00` if cost control is a concern.
- **Scope the review.** "Review everything" produces shallow results. Focus on specific areas (security, performance) or specific changes (last N commits, a specific file).
- **Allow git commands** so Claude Code can see what changed recently. Restrict to read-only git operations like `git diff` and `git log`.
- **Ask for prioritized output.** "Critical, warning, suggestion" levels make the results actionable.
