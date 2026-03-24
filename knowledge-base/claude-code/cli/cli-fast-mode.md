---
title: "Fast Mode: Lower Latency Responses"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Fast Mode

Fast mode trades reasoning depth for speed. Same model, faster output. It is a research preview feature.

## Toggling Fast Mode

```bash
# Inside a session
/fast
```

Toggle on and off as needed during a session. No restart required.

## Configuration

| Setting / Environment Variable             | Purpose                              |
|--------------------------------------------|--------------------------------------|
| `CLAUDE_CODE_ENABLE_FAST_MODE`             | Enable fast mode via environment     |
| `fastModePerSessionOptIn: true`            | Require opt-in each session          |

## When to Use Fast Mode

**Good for:**
- Quick, small edits (rename a variable, fix a typo)
- Simple questions ("what does this function return?")
- Rapid iteration cycles (edit → test → edit → test)
- Routine tasks where speed matters more than depth

**Bad for:**
- Complex reasoning and multi-step analysis
- Architecture decisions
- Debugging subtle issues
- Large refactors across many files

## Recommended Workflow

```
# Rapid iteration phase
/fast
> rename getUserData to fetchUserProfile across the codebase
> fix the typo on line 42 of utils.ts
> add a return type to the processOrder function

# Complex task — switch off
/fast
> Now debug why the payment webhook is silently failing
```

## Key Points

- Fast mode is the same model with reduced reasoning depth — not a different, weaker model.
- Toggle mid-session with `/fast` to match the task complexity.
- Research preview: behavior may change in future releases.
- For automation, pair with low effort level for maximum speed on simple tasks.
