---
title: "Effort levels and thinking depth"
category: "models"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Effort Levels

Effort controls how much thinking Claude does before responding. Higher effort means deeper reasoning but more tokens and time.

## Effort Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `low` | Minimal thinking, fastest responses | Simple tasks, quick edits, renaming |
| `medium` | Balanced thinking (default) | Most everyday coding tasks |
| `high` | Deep reasoning, thorough analysis | Complex debugging, architecture decisions |
| `max` | Maximum reasoning depth (Opus 4.6 only) | Hardest problems, multi-file refactors |

## How to Set Effort

### During a Session
```
/effort high
/effort low
```

### At Startup
```bash
claude --effort high
```

### Via Environment Variable
```bash
export CLAUDE_CODE_EFFORT_LEVEL=high
claude
```

### In Settings
```json
{
  "effortLevel": "medium"
}
```

### In Skill/Subagent Frontmatter
```yaml
---
effort: high
---
```

## Adaptive Reasoning

On Opus 4.6 and Sonnet 4.6, Claude Code uses adaptive reasoning — it dynamically allocates more or less thinking based on task complexity, even within a single effort level. A `medium` effort task that turns out to be complex may get more thinking automatically.

## The "ultrathink" Keyword

Include the word "ultrathink" in your message to force maximum thinking depth for that single turn, regardless of the current effort setting:

```
ultrathink — why is this race condition happening in the connection pool?
```

This is useful for one-off hard questions without changing your default effort level.

## Cost and Speed Impact

- `low`: ~2-3x faster, significantly cheaper
- `medium`: baseline
- `high`: ~1.5-2x slower, more tokens used for thinking
- `max`: slowest, highest cost, most thorough

Choose effort based on task complexity. Most code generation works fine at `medium`. Reserve `high`/`max` for genuinely hard problems.
