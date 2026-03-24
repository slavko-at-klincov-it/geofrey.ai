---
title: "Subagent Types — Exact Specifications and Tool Access"
category: "agents"
source_urls:
  - "https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic"
last_verified: "2026-03-24"
content_hash: ""
---

# Subagent Types — Exact Specifications and Tool Access

Claude Code's Agent tool (also referenced as the Task tool in some prompt versions) launches
specialized subprocesses. Each subagent type has a fixed set of tools and a specific role.

## Available Subagent Types

### 1. general-purpose
- **Tools:** `*` (all tools)
- **Role:** General-purpose agent for researching complex questions, searching for code, and
  executing multi-step tasks. Use when searching for a keyword or file and you are not
  confident you will find the right match in the first few tries.

### 2. Explore
- **Tools:** All tools EXCEPT `Agent/Task`, `ExitPlanMode`, `Edit`, `Write`, `NotebookEdit`
- **Role:** Fast read-only agent specialized for exploring codebases. Use for quickly finding
  files by glob patterns (e.g. `src/components/**/*.tsx`), searching code for keywords, or
  answering questions about the codebase.
- **Thoroughness parameter:** When calling this agent, specify the desired thoroughness level
  in the prompt:
  - `"quick"` — basic searches, one or two queries
  - `"medium"` — moderate exploration across several locations
  - `"very thorough"` — comprehensive analysis across multiple locations and naming conventions
- **Strict read-only enforcement:** The Explore agent prompt explicitly prohibits creating,
  modifying, deleting, moving, or copying files. Bash is restricted to read-only operations
  (ls, git status, git log, git diff, find, grep, cat, head, tail).
- **Speed focus:** Designed to return output as quickly as possible. Must make efficient use of
  tools and spawn multiple parallel tool calls for grepping and reading files.

### 3. Plan
- **Tools:** All tools EXCEPT `Agent/Task`, `ExitPlanMode`, `Edit`, `Write`, `NotebookEdit`
- **Role:** Software architect agent for designing implementation plans. Returns step-by-step
  plans, identifies critical files, and considers architectural trade-offs.
- **Read-only enforcement:** Same as Explore — cannot modify any files. Output ends with a
  "Critical Files for Implementation" section listing 5-10 files most relevant for the plan.
- **Perspectives:** Can be launched with different perspectives for complex tasks (e.g.,
  simplicity vs performance vs maintainability; root cause vs workaround vs prevention).

### 4. claude-code-guide
- **Tools:** `Glob`, `Grep`, `Read`, `WebFetch`, `WebSearch`
- **Role:** Answers questions about Claude Code features and configuration. Referenced in the
  debug skill as a subagent to launch when investigating Claude Code behavior.

### 5. statusline-setup
- **Tools:** `Read`, `Edit`
- **Role:** Configures the user's Claude Code status line setting. Converts PS1 from shell
  config into a statusLine command in Claude Code settings. Receives JSON input via stdin with
  session_id, model, workspace, context_window, and other metadata.

### 6. Bash
- **Tools:** `Bash`
- **Role:** Command execution specialist for running bash commands. Use for git operations,
  command execution, and other terminal tasks.

## Key Agent Parameters

| Parameter | Type | Description |
|---|---|---|
| `prompt` | string | Detailed task description with all necessary context |
| `description` | string | Short summary (3-5 words) of what the agent will do |
| `subagent_type` | string | One of the types above. Omit to fork yourself (inherits full context) |
| `model` | string | Optional model override: `"sonnet"`, `"opus"`, `"haiku"`. Do NOT set on forks — different model cannot reuse parent's prompt cache |
| `isolation` | string | Set to `"worktree"` for git worktree isolation |
| `run_in_background` | boolean | Run agent in background; you get notified on completion |
| `resume` | string | Agent ID from previous invocation to resume with full context preserved |

## Forking vs. Typed Subagents

- **Fork (omit subagent_type):** Inherits your full conversation context. Cheap because it
  shares your prompt cache. Use when intermediate tool output is not worth keeping in your
  context. Good for research and implementation that requires more than a couple of edits.
- **Typed subagent:** Starts fresh with no conversation history. Must provide complete task
  description with all necessary context in the prompt.

## Concurrency Rules

- Launch multiple agents concurrently whenever possible using a single message with multiple
  tool calls.
- Maximum 3 concurrent agents (enforced by some configurations).
- **Foreground (default):** Use when you need the agent's results before proceeding (e.g.,
  research agents whose findings inform next steps).
- **Background:** Use when you have genuinely independent work to do in parallel. You will be
  automatically notified when the background agent completes — do NOT sleep, poll, or
  proactively check on progress.

## Resume Pattern

When an agent completes, it returns its agent ID. To resume:
```
Agent({ resume: "<agent_id>", prompt: "Follow-up task description" })
```
The agent continues with its full previous context preserved.

## Anti-Patterns

- **Do not peek at fork output.** The tool result includes an `output_file` path — do not Read
  or tail it unless the user explicitly asks. You get a completion notification; trust it.
- **Do not race.** After launching, you know nothing about what the fork found. Never fabricate
  or predict fork results. If the user asks before the notification lands, tell them the fork
  is still running.
- **Do not duplicate work.** If you delegate research to a subagent, do not perform the same
  searches yourself.
- **Provide complete prompts.** Clearly tell the agent whether you expect it to write code or
  just do research, since it is not aware of the user's intent.
