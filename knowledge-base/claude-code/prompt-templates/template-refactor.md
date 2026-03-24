---
title: "Prompt template for refactoring tasks in Claude Code"
category: "prompt-templates"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Refactoring Prompt Template

Use this template when Maestro needs to dispatch a refactoring task to Claude Code. Refactoring changes code structure without changing behavior, so explicit constraints are essential.

## Template

```bash
claude -p "$(cat <<'EOF'
Refactor: [what to refactor and why]
Goals:
- [goal 1]
- [goal 2]
Constraints:
- Do not change public API/interfaces
- All existing tests must still pass
- Commit each logical change separately
EOF
)" \
  --cwd [project_path] \
  --model opus \
  --max-turns 50 \
  --max-budget-usd 5.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test),Bash(npm run lint),Bash(git add -A && git commit -m *)"
```

## Filled Example

```bash
claude -p "$(cat <<'EOF'
Refactor: Extract the authentication logic from src/screens/ into a shared auth service.
Currently, login, registration, and password reset screens each implement their own
API calls and token handling. This causes duplication and inconsistent error handling.

Goals:
- Create src/services/authService.ts with all auth-related API calls
- Create src/hooks/useAuth.ts hook for screens to consume
- Remove duplicated auth logic from individual screens
- Improve error handling: all auth errors should go through one handler

Constraints:
- Do not change public API/interfaces (screens must still export the same components)
- All existing tests must still pass
- Commit each logical change separately:
  1. First commit: create authService.ts
  2. Second commit: create useAuth.ts hook
  3. Third commit: refactor screens to use the new hook
  4. Fourth commit: remove dead code
EOF
)" \
  --cwd ~/Code/meus/ \
  --model opus \
  --max-turns 50 \
  --max-budget-usd 5.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test),Bash(npm run lint)"
```

## Usage Notes

- **Use Opus for refactoring.** Refactoring requires understanding the existing architecture and making changes that preserve behavior. This is deep reasoning work where Opus excels.
- **Be explicit about constraints.** Refactoring without constraints leads to scope creep. "Do not change public interfaces" and "all tests must pass" are non-negotiable.
- **Request separate commits.** Atomic commits make it easy to review each step and revert individual changes if needed. Without this instruction, Claude Code tends to make all changes in one large commit.
- **50 turns, $5.00 budget.** Refactoring is turn-intensive: read existing code, plan changes, implement, run tests, fix issues. Budget accordingly.
- **Include git commit in allowedTools** only if you want Claude Code to commit as it goes. Omit it if you prefer to review and commit manually.
- **Run tests after review.** Even with the "tests must pass" constraint, always verify manually:
  ```bash
  cd ~/Code/meus && npm run test
  ```
- **For large refactors**, break into phases and dispatch each as a separate task. A single session restructuring 20+ files is risky. Prefer: Phase 1 (create new abstractions) then Phase 2 (migrate consumers) then Phase 3 (remove old code).
