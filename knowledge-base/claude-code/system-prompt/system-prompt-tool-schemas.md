---
title: "Claude Code Tool Schemas Reference"
category: "system-prompt"
source_urls:
  - "https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic"
last_verified: "2026-03-24"
content_hash: ""
---

# Claude Code Tool Schemas Reference

Complete list of tools available to Claude Code with key parameters and behavior.

## Core File & Code Tools

### Read
Reads files from the local filesystem. Multimodal — handles text, images, PDFs, notebooks.
Params: `file_path` (required, absolute), `offset` (line number), `limit` (line count),
`pages` (PDF page range, e.g. "1-5", max 20).
Default reads 2000 lines. Returns `cat -n` format. Must Read before Edit.

### Edit
Exact string replacement in files.
Params: `file_path` (required), `old_string` (required), `new_string` (required),
`replace_all` (boolean, default false).
Fails if old_string not unique (unless replace_all). Must Read first. Preserve indentation.

### Write
Creates or overwrites files.
Params: `file_path` (required, absolute), `content` (required).
Must Read existing files first. Prefer Edit for modifications.

### Glob
Fast file pattern matching. Returns paths sorted by modification time.
Params: `pattern` (required, e.g. "**/*.js"), `path` (optional, default cwd).

### Grep
Content search built on ripgrep. Use instead of bash grep/rg.
Params: `pattern` (required, regex), `path`, `glob` (file filter), `type` (js/py/rust),
`output_mode` ("files_with_matches"|"content"|"count"), `context`/-C/-A/-B (context lines),
`-n` (line numbers), `-i` (case insensitive), `multiline`, `head_limit`, `offset`.
Literal braces need escaping: `interface\{\}`.

### NotebookEdit
Edits Jupyter notebook cells.
Params: `notebook_path` (required, absolute), `cell_id`, `new_source` (required),
`cell_type` ("code"|"markdown"), `edit_mode` ("replace"|"insert"|"delete").

## Bash & Shell Execution

### Bash
Executes shell commands with optional timeout.
Params: `command` (required), `timeout` (ms, max 600000, default 120000),
`description` (human-readable), `run_in_background` (boolean),
`dangerouslyDisableSandbox` (boolean, bypass sandbox).
Working dir persists; shell state does not. Output truncated at 30000 chars.
Avoid for file operations (use dedicated tools). Avoid find/grep/cat/sed/awk/echo.
Chain dependent commands with `&&`. Git safety protocol embedded in this tool.

## Task & Process Management

### Task (Agent Launcher)
Launches specialized sub-agents for complex tasks.
Params: `description` (required, 3-5 words), `prompt` (required, detailed task),
`subagent_type` (required), `model` ("sonnet"|"opus"|"haiku", default inherit),
`resume` (agent ID), `run_in_background`, `max_turns`, `isolation` ("worktree").
Agent types: `Bash` (shell only), `general-purpose` (all tools), `Explore` (read-only
codebase search), `Plan` (architecture planning, read-only), `statusline-setup`.

### TaskOutput / TaskStop
TaskOutput: `task_id` (required), `block` (default true), `timeout` (default 30000ms).
TaskStop: `task_id` to terminate a running background task.

### TodoWrite
Session task list. Params: `todos` (required array).
Each todo: `content`, `status` (pending/in_progress/completed), `activeForm`.

## Web & Network Tools

### WebFetch
Fetches and processes web content via AI model.
Params: `url` (required, auto-upgrades to HTTPS), `prompt` (required, what to extract).
Fails for authenticated URLs. 15-minute cache. Follows redirects with notification.

### WebSearch
Web search for current information.
Params: `query` (required, min 2 chars), `allowed_domains`, `blocked_domains` (arrays).
Must include Sources section with markdown hyperlinks after answering.

## Planning & Communication Tools

### EnterPlanMode / ExitPlanMode
EnterPlanMode: transitions to plan mode for non-trivial tasks. No parameters.
ExitPlanMode: signals plan ready for review. Param: `allowedPrompts` (array of
{tool, prompt} objects declaring Bash permissions needed for implementation).

### AskUserQuestion
Structured questions for the user.
Params: `questions` (required, 1-4 items). Each: `question` (string), `header`
(max 12 chars), `options` (2-4 items with label + description + optional markdown
preview), `multiSelect` (boolean).

### Skill
Invokes a registered skill (slash command).
Params: `skill` (required, e.g. "commit", "pdf"), `args` (optional).

### ToolSearch
Loads deferred tool schemas on demand.
Params: `query` (required), `max_results` (default 5).
Query forms: `"select:Read,Edit,Grep"` (exact), `"notebook jupyter"` (keyword),
`"+slack send"` (require name match + rank).
