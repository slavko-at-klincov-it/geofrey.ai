---
title: "Claude Code Model and Effort Flags"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Model and Effort Flags

These flags control which Claude model is used and how much reasoning effort it applies.

## `--model <alias|name>`

Set the model for the session. Accepts model aliases or full model identifiers.

```bash
claude -p "task" --model sonnet
claude -p "task" --model opus
claude -p "task" --model haiku
claude -p "task" --model opusplan
```

### Model Aliases

| Alias       | Resolves To                          | Notes                                    |
|-------------|--------------------------------------|------------------------------------------|
| `sonnet`    | Latest Claude Sonnet 4.6            | Best balance of speed and capability     |
| `opus`      | Latest Claude Opus 4.6              | Most capable, slower, higher cost        |
| `haiku`     | Claude Haiku 4.5                    | Fastest, lowest cost, less capable       |
| `opusplan`  | Opus (planning) + Sonnet (execution)| Opus plans the approach, Sonnet executes |

### Extended Context Variants

Append `[1m]` to use the 1-million-token context window:

```bash
claude -p "task" --model "sonnet[1m]"
claude -p "task" --model "opus[1m]"
```

Use extended context when working with very large codebases or when the task requires reading many files simultaneously.

### Full Model Names

You can also use full Anthropic model identifiers:

```bash
claude -p "task" --model "claude-sonnet-4-6-20260320"
```

## `--effort <level>`

Control the reasoning effort level. Higher effort means more thorough analysis but slower responses and higher cost.

| Level    | Behavior                                                    |
|----------|-------------------------------------------------------------|
| `low`    | Quick responses, minimal deliberation. Good for simple tasks. |
| `medium` | Balanced reasoning. Default for most models.                |
| `high`   | Thorough analysis. Good for complex code tasks.             |
| `max`    | Maximum reasoning depth. Use for the hardest problems.      |

```bash
claude -p "rename this variable" --effort low
claude -p "refactor the auth system" --effort high
claude -p "find the concurrency bug" --effort max
```

## `--fallback-model <model>`

Specify a fallback model to use when the primary model is overloaded. Only works in print mode.

```bash
claude -p "task" --model opus --fallback-model sonnet
```

If Opus is overloaded or unavailable, Claude Code automatically retries with Sonnet instead of failing.

## Environment Variables

These environment variables set default models without CLI flags:

| Variable                            | Purpose                              |
|-------------------------------------|--------------------------------------|
| `ANTHROPIC_MODEL`                   | Default model for all invocations    |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`      | Override which model the `opus` alias resolves to |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`    | Override which model the `sonnet` alias resolves to |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`     | Override which model the `haiku` alias resolves to |

```bash
export ANTHROPIC_MODEL="sonnet"
claude -p "task"  # uses Sonnet without --model flag
```

## Choosing a Model for Orchestration

For Maestro orchestration, consider this strategy:

- **Planning / architecture tasks:** `--model opus` or `--model opusplan`
- **Standard implementation tasks:** `--model sonnet` (best cost/capability ratio)
- **Simple edits, linting, formatting:** `--model haiku` (fast and cheap)
- **Large codebase analysis:** `--model "sonnet[1m]"` or `--model "opus[1m]"`
- **Reliability:** Add `--fallback-model sonnet` when using opus to handle overload gracefully
