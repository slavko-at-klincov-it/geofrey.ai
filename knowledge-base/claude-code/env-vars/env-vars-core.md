---
title: "Core environment variables for Claude Code configuration"
category: "env-vars"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
  - "https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex"
last_verified: "2026-03-22"
content_hash: ""
---

# Core Environment Variables

These environment variables configure Claude Code's API connection, authentication, and model selection. Set them in your shell before launching Claude Code.

## Authentication

### ANTHROPIC_API_KEY
The API key for authenticating with Anthropic's API. Overrides subscription-based login.

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

When set, Claude Code uses this key instead of requiring `claude login`. Required for programmatic/headless usage.

### ANTHROPIC_AUTH_TOKEN
Custom authorization header value. Used when routing through a proxy that requires its own auth.

```bash
export ANTHROPIC_AUTH_TOKEN="Bearer my-proxy-token"
```

## API Endpoint

### ANTHROPIC_BASE_URL
Override the API endpoint. Use this to route through a proxy, gateway, or custom endpoint.

```bash
export ANTHROPIC_BASE_URL="https://my-proxy.company.com/v1"
```

## Model Selection

### ANTHROPIC_MODEL
Set the default model Claude Code uses.

```bash
export ANTHROPIC_MODEL="claude-sonnet-4-20250514"
```

### ANTHROPIC_DEFAULT_OPUS_MODEL
Override the model used when "opus" is selected.

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-20250514"
```

### ANTHROPIC_DEFAULT_SONNET_MODEL
Override the model used when "sonnet" is selected.

```bash
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-20250514"
```

### ANTHROPIC_DEFAULT_HAIKU_MODEL
Override the model used when "haiku" is selected.

```bash
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-haiku-3-5-20241022"
```

### ANTHROPIC_CUSTOM_MODEL_OPTION
Add a custom model option to the model picker in interactive mode.

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="my-fine-tuned-model"
```

## Cloud Provider Backends

### CLAUDE_CODE_USE_BEDROCK
Route requests through AWS Bedrock instead of the Anthropic API.

```bash
export CLAUDE_CODE_USE_BEDROCK=1
# Also set AWS credentials:
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
```

### CLAUDE_CODE_USE_VERTEX
Route requests through Google Cloud Vertex AI.

```bash
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION="us-east5"
export ANTHROPIC_VERTEX_PROJECT_ID="my-gcp-project"
```

### CLAUDE_CODE_USE_FOUNDRY
Route requests through Microsoft Azure AI Foundry.

```bash
export CLAUDE_CODE_USE_FOUNDRY=1
```

## For Maestro Orchestration

When spawning Claude Code sessions, pass these as environment variables to the child process:

```javascript
const { spawn } = require('child_process');

const child = spawn('claude', ['-p', task, '--cwd', projectDir], {
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
    ANTHROPIC_BASE_URL: proxyUrl || undefined
  }
});
```

Never pass the API key via the `-p` prompt argument. Always use the environment variable.
