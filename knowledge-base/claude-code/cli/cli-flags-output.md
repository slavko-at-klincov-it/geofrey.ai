---
title: "Claude Code Output and Format Flags"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Output and Format Flags

These flags control how Claude Code formats its output and how input is provided. They are especially important in print mode for automation and orchestration.

## `--output-format <format>`

Control the format of Claude's response. Only meaningful in print mode (`-p`).

| Format         | Output                                                        |
|----------------|---------------------------------------------------------------|
| `text`         | Plain text response. Default in print mode.                   |
| `json`         | Single JSON object with the full result after completion.     |
| `stream-json`  | Newline-delimited JSON objects streamed as Claude works.      |

```bash
# Plain text output
claude -p "explain this function" --output-format text

# JSON output for programmatic parsing
claude -p "list all API endpoints" --output-format json

# Streaming JSON for real-time monitoring
claude -p "implement the feature" --output-format stream-json
```

### JSON Output Structure

With `--output-format json`, the response is a JSON object containing:
- The final text response
- Token usage information
- Session metadata
- Tool use history

With `--output-format stream-json`, each line is a separate JSON object representing an event (message start, content block, tool use, etc.). This is useful for monitoring progress in real time.

## `--input-format <format>`

Control how input is interpreted.

| Format         | Behavior                                        |
|----------------|-------------------------------------------------|
| `text`         | Input is plain text. Default.                   |
| `stream-json`  | Input is newline-delimited JSON messages.       |

```bash
# Stream JSON input for programmatic control
echo '{"type":"human","content":"hello"}' | claude -p --input-format stream-json
```

`stream-json` input format allows sending structured messages programmatically, which is useful for orchestration systems that need fine-grained control over the conversation.

## `--json-schema <schema>`

Force Claude to return output matching a specific JSON schema. Only works in print mode. Claude validates its output against the schema before returning.

```bash
# Get structured analysis results
claude -p "analyze src/auth.ts for bugs" --json-schema '{
  "type": "object",
  "properties": {
    "bugs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file": {"type": "string"},
          "line": {"type": "integer"},
          "severity": {"type": "string", "enum": ["low", "medium", "high"]},
          "description": {"type": "string"}
        },
        "required": ["file", "line", "severity", "description"]
      }
    }
  },
  "required": ["bugs"]
}'
```

This is extremely useful for orchestration — Maestro can define exactly what structure it expects back from each task.

## `--max-budget-usd <amount>`

Set a maximum dollar amount Claude can spend on API calls before stopping. Only works in print mode.

```bash
claude -p "refactor the entire codebase" --max-budget-usd 5.00
```

If Claude reaches the budget limit, it stops and returns what it has so far. This is a critical safety mechanism for orchestration to prevent runaway costs.

## `--max-turns <n>`

Limit the number of agentic turns (tool use cycles) Claude can take. Only works in print mode.

```bash
claude -p "implement the feature" --max-turns 30
```

Each "turn" is one cycle of Claude thinking + using a tool. A complex task might take 20-50 turns. Setting a limit prevents infinite loops and controls execution time.

**Guidelines for setting `--max-turns`:**
- Simple edits: 5-10 turns
- Standard feature implementation: 20-40 turns
- Complex multi-file refactors: 40-80 turns
- Analysis / review tasks: 10-20 turns

## `--include-partial-messages`

Include intermediate streaming events in the output. Used with `--output-format stream-json` to get content as it is generated, not just completed messages.

```bash
claude -p "task" --output-format stream-json --include-partial-messages
```

## Recommended Output Patterns for Orchestration

**Standard task with cost control:**
```bash
claude -p "implement user registration" \
  --output-format json \
  --max-turns 40 \
  --max-budget-usd 2.00
```

**Structured result extraction:**
```bash
claude -p "list all TODO comments in the codebase" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"todos":{"type":"array","items":{"type":"object","properties":{"file":{"type":"string"},"line":{"type":"integer"},"text":{"type":"string"}},"required":["file","line","text"]}}},"required":["todos"]}'
```

**Real-time progress monitoring:**
```bash
claude -p "refactor the auth module" \
  --output-format stream-json \
  --include-partial-messages
```
