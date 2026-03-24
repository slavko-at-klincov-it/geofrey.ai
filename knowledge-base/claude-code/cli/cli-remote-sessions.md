---
title: "Remote sessions and cloud execution"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-usage"
last_verified: "2026-03-22"
content_hash: ""
---

# Remote Sessions

Run Claude Code on Anthropic's cloud infrastructure. Sessions persist even if you close your terminal or shut down your machine.

## Starting a Remote Session

```bash
claude --remote
```

This creates a session on Anthropic cloud. Claude works on your codebase remotely, using Anthropic infrastructure for execution.

## Key Flags

| Flag | Description |
|------|-------------|
| `--remote` | Start a new remote session |
| `--teleport` | Resume a web-based session in your terminal |
| `--remote-control` or `--rc` | Enable remote control from another device |

## Checking Progress

Once a remote session is running, you can check on it from:

- **iOS app** — open the Claude app and view session progress
- **Web** — check from any browser
- **Another terminal** — reconnect to the session

## Teleporting Sessions

Start a session on the web, then pull it into your terminal:

```bash
claude --teleport
```

This is useful when you started work on the web but want terminal tool access.

## Remote Control

```bash
claude --remote-control
claude --rc
```

Enables control of your local Claude Code session from another device (e.g., your phone).

## Multiple Repos

A single remote session can work across multiple repositories.

## SSH Sessions

Run Claude Code on remote machines (e.g., cloud VMs, dev servers) via the Desktop app's SSH integration.

## Best Use Cases

- **Overnight tasks** — start a large refactor before bed, check results in the morning
- **Long migrations** — database schema changes, framework upgrades
- **CI-like work without CI** — run test suites, fix failures, push results
- **Survive disconnects** — spotty WiFi, laptop goes to sleep, session continues

## Example: Overnight Migration

```bash
claude --remote -p "migrate the entire codebase from Express to Fastify, update all tests" \
  --cwd ~/Code/api-server \
  --max-turns 200 \
  --max-budget-usd 20
```

Close your laptop. Check progress on your phone the next morning.
