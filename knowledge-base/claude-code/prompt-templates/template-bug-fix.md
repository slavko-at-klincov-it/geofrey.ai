---
title: "Prompt template for bug fix tasks in Claude Code"
category: "prompt-templates"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Bug Fix Prompt Template

Use this template when Maestro needs to dispatch a bug fix task to Claude Code.

## Template

```bash
claude -p "$(cat <<'EOF'
Bug: [description of the bug]
Location: [file path or component name, if known]
Expected behavior: [what should happen]
Actual behavior: [what happens instead]
Steps to reproduce: [numbered steps, if known]
Error message: [exact error text, if available]

Fix this bug. Run tests after fixing. Do not change unrelated code.
EOF
)" \
  --cwd [project_path] \
  --model sonnet \
  --max-turns 30 \
  --max-budget-usd 2.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test)"
```

## Filled Example

```bash
claude -p "$(cat <<'EOF'
Bug: Users can submit the registration form with an invalid email address
Location: src/components/RegisterForm.tsx
Expected behavior: Form shows validation error for emails without @ symbol
Actual behavior: Form submits successfully, server returns 500 error
Steps to reproduce:
1. Go to /register
2. Enter "notanemail" in the email field
3. Fill other fields correctly
4. Click Submit
Error message: "TypeError: Cannot read property 'split' of undefined" in server logs

Fix this bug. Run tests after fixing. Do not change unrelated code.
EOF
)" \
  --cwd ~/Code/meus/ \
  --model sonnet \
  --max-turns 30 \
  --max-budget-usd 2.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test)"
```

## Usage Notes

- **Be specific about the bug.** "It's broken" is not enough. Describe what happens vs. what should happen.
- **Include error messages** verbatim. Stack traces and error codes help Claude Code find the root cause faster.
- **Specify the file** if you know it. This saves turns spent searching.
- **"Do not change unrelated code"** is critical. Without it, Claude Code may refactor nearby code while fixing the bug.
- **30 turns** is generous for most bug fixes. Simple bugs resolve in 5-10 turns. The extra headroom handles cases where tests need fixing too.
- **$2.00 budget** covers a thorough investigation with Sonnet. Reduce to $1.00 for trivial bugs.
- **Use Sonnet**, not Opus. Most bugs do not require deep architectural reasoning. Sonnet is faster and cheaper.
- **Adjust --allowedTools** to match the project's test command (`pytest`, `go test`, etc.).
