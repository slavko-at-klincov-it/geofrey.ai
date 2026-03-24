---
title: "Prompt template for feature implementation tasks in Claude Code"
category: "prompt-templates"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Feature Implementation Prompt Template

Use this template when Maestro needs to dispatch a new feature task to Claude Code.

## Template

```bash
claude -p "$(cat <<'EOF'
Add feature: [description of the feature]
Requirements:
- [requirement 1]
- [requirement 2]
- [requirement 3]
Tech constraints: [any limitations, libraries to use or avoid]
Files to create/modify: [if known]

Implement this feature following existing code patterns. Add tests. Do not refactor existing code.
EOF
)" \
  --cwd [project_path] \
  --model sonnet \
  --max-turns 50 \
  --max-budget-usd 5.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test),Bash(npm run lint)"
```

## Filled Example

```bash
claude -p "$(cat <<'EOF'
Add feature: Export invoices as PDF
Requirements:
- Add a "Download PDF" button to the invoice detail page
- PDF should include company logo, invoice items table, totals, and payment info
- Use @react-pdf/renderer (already installed)
- Match the existing invoice detail page layout as closely as possible
- File name format: invoice-{invoice_number}.pdf
Tech constraints: Must work in React Native Web (no browser-only APIs)
Files to create/modify: src/components/InvoicePDF.tsx (new), src/screens/InvoiceDetail.tsx (modify)

Implement this feature following existing code patterns. Add tests. Do not refactor existing code.
EOF
)" \
  --cwd ~/Code/aibuchhalter/ \
  --model sonnet \
  --max-turns 50 \
  --max-budget-usd 5.00 \
  --allowedTools "Read,Grep,Glob,Edit,Bash(npm run test),Bash(npm run lint)"
```

## Usage Notes

- **More turns than bug fixes.** Features require reading existing code, creating files, writing tests, and iterating. 50 turns is a good default.
- **Higher budget.** Feature work consumes more tokens. $5.00 handles most medium features with Sonnet.
- **"Do not refactor existing code"** prevents scope creep. Without this instruction, Claude Code often "improves" surrounding code while adding the feature, making the diff harder to review.
- **List requirements explicitly.** Numbered or bulleted requirements are clearer than prose descriptions.
- **Specify tech constraints.** If a specific library must be used, or a specific approach must be followed, state it. Claude Code will otherwise choose its own approach.
- **Mention files to modify** if you know them. This reduces exploratory turns.
- **Include lint command** in allowedTools so Claude Code can check its work matches project style.
- **Use Sonnet for most features.** Switch to Opus only for features requiring complex architectural decisions (e.g., designing a new data model or state management pattern).
- **For large features**, break them into smaller sub-tasks and dispatch each separately. A single 100-turn session is less reliable than three 30-turn sessions with clear boundaries.
