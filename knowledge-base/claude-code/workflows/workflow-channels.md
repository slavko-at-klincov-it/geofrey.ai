---
title: "Channels for event-driven push notifications"
category: "workflows"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-usage"
last_verified: "2026-03-22"
content_hash: ""
---

# Channels — Event-Driven Notifications

Channels push real-time events into running Claude Code sessions from external services. Instead of polling with `/loop`, events arrive instantly when something happens.

## Why Channels Over Polling

| Approach | How It Works | Latency |
|----------|-------------|---------|
| `/loop 5m /check-ci` | Claude checks every 5 minutes | Up to 5 min delay |
| Channel | CI pushes failure event instantly | Seconds |

Channels are faster and more efficient — Claude only acts when there is something to act on.

## Configuration

Set up channels via the `--channels` flag or through MCP server configuration.

## Channel Sources

Channels can receive events from:

- **GitHub webhooks** — PR opened, review requested, CI status changed
- **CI systems** — build failed, tests failed, deployment completed
- **Monitoring alerts** — error rate spike, service down, performance degradation
- **Custom webhooks** — any system that can send HTTP events

## How It Works

1. External service sends an event to the channel
2. Claude Code receives the event in real-time
3. Claude reads the event payload and context
4. Claude takes action (fix code, respond to review, investigate alert)

## Example: Auto-Fix CI Failures

1. Configure a channel connected to your CI system
2. CI runs tests on push
3. Tests fail → CI sends failure event to channel
4. Claude receives the event, reads the error logs
5. Claude identifies the issue, fixes the code, pushes a new commit

The entire loop from failure to fix happens automatically, in seconds.

## Example: PR Review Notifications

1. Channel connected to GitHub
2. Reviewer requests changes on your PR
3. Event arrives in Claude's session
4. Claude reads the review comments and addresses them

## Status

Channels is a research preview feature. The API and behavior may change in future releases.
