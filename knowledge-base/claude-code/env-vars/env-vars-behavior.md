---
title: "Behavior control environment variables for Claude Code"
category: "env-vars"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Behavior Control Environment Variables

These environment variables control how Claude Code behaves during execution — thinking budget, compaction, timeouts, and feature toggles.

## Reasoning and Effort

### CLAUDE_CODE_EFFORT_LEVEL
Set the default effort level. Controls how thoroughly Claude Code reasons about tasks.

```bash
export CLAUDE_CODE_EFFORT_LEVEL="high"  # Options: low, medium, high
```

### MAX_THINKING_TOKENS
Limit the extended thinking budget. Caps how many tokens Claude Code spends on reasoning.

```bash
export MAX_THINKING_TOKENS=10000
```

### CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING
Disable adaptive reasoning that adjusts thinking effort based on task complexity.

```bash
export CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1
```

## Context Management

### CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
Set the context window percentage at which automatic compaction triggers. Value 1-100.

```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70  # Compact at 70% context usage
```

When context usage exceeds this threshold, Claude Code automatically summarizes the conversation to free up space. Lower values compact more aggressively, keeping more headroom.

## Feature Toggles

### CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
Disable background task execution.

```bash
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

### CLAUDE_CODE_DISABLE_AUTO_MEMORY
Disable automatic memory (prevents Claude Code from writing to CLAUDE.md automatically).

```bash
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
```

### CLAUDE_CODE_SIMPLE
Enable minimal mode — only Bash and file tools are available. Disables MCP, web search, and other advanced tools.

```bash
export CLAUDE_CODE_SIMPLE=1
```

## Shell and Execution

### CLAUDE_CODE_SHELL
Override which shell Claude Code uses for Bash commands.

```bash
export CLAUDE_CODE_SHELL="/bin/bash"  # Force bash even if user's default is zsh
```

### CLAUDECODE
This variable is automatically set to `1` inside shells spawned by Claude Code. Use it to detect if your script is running inside a Claude Code session.

```bash
if [ "$CLAUDECODE" = "1" ]; then
  echo "Running inside Claude Code"
fi
```

## Timeouts

### BASH_DEFAULT_TIMEOUT_MS
Default timeout for Bash commands in milliseconds.

```bash
export BASH_DEFAULT_TIMEOUT_MS=120000  # 2 minutes (default)
```

### BASH_MAX_TIMEOUT_MS
Maximum allowed timeout for Bash commands.

```bash
export BASH_MAX_TIMEOUT_MS=600000  # 10 minutes
```

### BASH_MAX_OUTPUT_LENGTH
Maximum output length from Bash commands before truncation.

```bash
export BASH_MAX_OUTPUT_LENGTH=100000  # characters
```

### MCP_TIMEOUT
Timeout for MCP server startup in milliseconds.

```bash
export MCP_TIMEOUT=30000  # 30 seconds
```

### MCP_TOOL_TIMEOUT
Timeout for individual MCP tool executions in milliseconds.

```bash
export MCP_TOOL_TIMEOUT=60000  # 60 seconds
```

## Telemetry and Updates

### DISABLE_TELEMETRY
Opt out of anonymous usage telemetry.

```bash
export DISABLE_TELEMETRY=1
```

### DISABLE_AUTOUPDATER
Disable automatic updates of Claude Code.

```bash
export DISABLE_AUTOUPDATER=1
```

## For Maestro Orchestration

Recommended defaults when spawning Claude Code sessions:

```javascript
const env = {
  ...process.env,
  // Disable features that interfere with automation
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',

  // Set reasonable timeouts
  BASH_DEFAULT_TIMEOUT_MS: '120000',
  BASH_MAX_TIMEOUT_MS: '600000',
  MCP_TIMEOUT: '30000',

  // Control context usage
  CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '70',

  // Set effort based on task complexity
  CLAUDE_CODE_EFFORT_LEVEL: taskComplexity
};
```
