---
title: "Built-in subagent types"
category: "agents"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/sub-agents"
last_verified: "2026-03-22"
content_hash: ""
---

# Built-in Subagents

Claude Code has built-in subagents it spawns automatically for specific tasks. Each has a defined role, toolset, and model.

## Explore Agent

- **Model:** Haiku (fast, cheap)
- **Tools:** Read-only (Read, Grep, Glob)
- **Purpose:** Quick codebase exploration and information gathering
- **When used:** Claude needs to scan files or find information without making changes

Claude spawns Explore agents to quickly search through files, find definitions, or understand code structure — without burning expensive Opus/Sonnet tokens.

## Plan Agent

- **Model:** Inherits the current model
- **Tools:** Read-only (Read, Grep, Glob)
- **Purpose:** Research and planning before taking action
- **When used:** Complex tasks where Claude needs to understand the landscape before writing code

The Plan agent reads files, traces dependencies, and builds an understanding of what needs to change — then returns a plan to the main agent for execution.

## General-Purpose Agent

- **Model:** Inherits the current model
- **Tools:** All tools (Read, Write, Edit, Bash, etc.)
- **Purpose:** Complex multi-step tasks that benefit from isolated context
- **When used:** Subtasks that are self-contained but need full capabilities

This agent gets its own context window, so its work doesn't bloat the main conversation.

## Bash Agent

- **Model:** Inherits the current model
- **Tools:** All tools
- **Purpose:** Terminal-focused work in an isolated environment
- **When used:** Running commands, build tasks, test suites

## How Subagents Work

- Claude spawns subagents automatically when it determines a subtask benefits from isolation
- Each subagent gets its own context window (doesn't consume the main conversation's context)
- Results are summarized and returned to the main agent
- You can also invoke them with `@agent-name` in your message

## Example: What Happens Behind the Scenes

When you ask "Add error handling to all API routes," Claude might:
1. Spawn an **Explore** agent (Haiku) to find all API route files
2. Spawn a **Plan** agent to analyze current error handling patterns
3. Use the main agent to make the actual edits based on the plan
