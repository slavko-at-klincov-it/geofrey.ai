---
title: "Model selection and switching"
category: "models"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Model Selection and Switching

Claude Code supports multiple models. You can switch models at any time during a session or set a default.

## How to Select a Model

### During a Session
```
/model sonnet
/model opus
```
The `/model` command with no argument opens an interactive picker with arrow keys.

### At Startup
```bash
claude --model opus
claude --model claude-sonnet-4-6
```

### Via Environment Variable
```bash
export ANTHROPIC_MODEL=claude-opus-4-6
claude
```

### In Settings
Add to your settings.json:
```json
{
  "model": "claude-sonnet-4-6"
}
```

## Model Aliases

Short aliases you can use anywhere a model name is accepted:

| Alias | Full Model ID |
|-------|--------------|
| `sonnet` | claude-sonnet-4-6 |
| `opus` | claude-opus-4-6 |
| `haiku` | claude-haiku-4-5-20251001 |
| `opusplan` | Opus for planning, Sonnet for execution |
| `sonnet[1m]` | Sonnet with 1M context window |
| `opus[1m]` | Opus with 1M context window |

## Restricting Available Models

Admins can limit which models users can select using `availableModels` in managed settings:

```json
{
  "availableModels": ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]
}
```

When set, users can only switch between the listed models.

## Checking Current Model

The current model is shown in the Claude Code status bar. You can also run `/model` to see the active model and switch.
