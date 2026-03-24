---
title: "Cowork Mode MCP Tools and Capabilities"
category: "cowork"
source_urls:
  - "https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic"
last_verified: "2026-03-24"
content_hash: ""
---

# Cowork Mode MCP Tools and Capabilities

Cowork mode extends the standard Claude Code toolset with MCP (Model Context Protocol) tools
for host integration, browser automation, plugins, and scheduled tasks. This chunk documents
the specific MCP tools available in Cowork that are NOT available in CLI Claude Code.

## MCP: Cowork (Host Integration)

These three tools handle the boundary between the sandboxed Linux VM and the user's host machine.

### request_cowork_directory

Request access to a directory on the user's computer. Mounts a host directory into the VM.

- If you know the path, pass it — user sees and approves, then it's mounted
- If you omit the path, a native folder picker opens (local sessions only)
- In remote sessions, the path parameter is required
- Use whenever the user asks to work with files Claude doesn't currently have access to

Parameters:
- `path` (optional): Host path to mount (e.g., `~/Downloads`). Required in remote sessions.

### allow_cowork_file_delete

Request permission to delete files in a directory. This is a permission escalation tool.

- Call this whenever a delete operation (e.g., `rm`) fails with "Operation not permitted"
- Do NOT tell the user it is impossible — call this tool instead
- The user will be prompted to approve the deletion

Parameters:
- `file_path` (required): The VM path of the file to delete

### present_files

Present files to the user with interactive cards rendered in the chat interface.

- Use after creating files the user should see
- Files ending in `.skill` render with a "Copy to your skills" install button
- This is the primary way to share deliverables with the user in-chat

Parameters:
- `files` (required): Array of objects, each with `file_path` (absolute path to the file)

## MCP: Scheduled Tasks

Cowork supports both recurring (cron-based) and one-time scheduled tasks.

### list_scheduled_tasks

List all scheduled tasks with current state. Returns taskId, description, schedule,
cronExpression, fireAt, enabled, nextRunAt, lastRunAt. Use to discover existing tasks
before updating.

### create_scheduled_task

Create a new scheduled task. The task is stored as a skill file in the Scheduled directory.

Scheduling options (pick at most one):
- `cronExpression`: Recurring schedule. Cron is evaluated in LOCAL timezone, not UTC.
  - `"0 9 * * *"` — Every day at 9:00 AM local
  - `"0 9 * * 1-5"` — Weekdays at 9:00 AM local
  - `"30 8 * * 1"` — Every Monday at 8:30 AM local
- `fireAt`: One-time — runs once at given moment, then auto-disables. ISO 8601 with timezone.
  - `"2026-03-05T14:30:00-08:00"` — Once on March 5 at 2:30 PM Pacific
- Omit both: "ad-hoc" — can only be started manually

Recurring tasks apply a small deterministic delay. One-time tasks fire without delay.

Parameters:
- `taskId` (required): Kebab-case identifier (e.g., "check-inbox")
- `prompt` (required): Full task prompt/instructions executed each run
- `description` (required): Short one-line description
- `cronExpression` (optional): 5-field cron in LOCAL time
- `fireAt` (optional): ISO 8601 timestamp with offset

### update_scheduled_task

Update an existing scheduled task. Supports partial updates — only supply fields to change.
Setting a new cronExpression clears fireAt and vice versa.

Parameters:
- `taskId` (required): Exact ID from list_scheduled_tasks
- All other fields optional: description, prompt, cronExpression, fireAt, enabled

## MCP: Plugins

### search_plugins

Search for installable plugins. Call when the request references the user's own work context
(pipeline, accounts, contracts, tickets, playbooks, templates, company data) and Claude
doesn't have a covering tool.

- Plugins are matched by skills, commands, and bundled connectors
- Do not call for generic knowledge tasks Claude can answer directly
- Do not use browser or web search to find plugins — this is the only source
- Results include `matchedCapabilities` showing which skill/command/connector matched

Parameters:
- `userIntent` (required): User's request in natural language
- `keywords` (optional): Extra keywords for specific products, domains, or jargon

### suggest_plugin_install

Display a plugin installation suggestion banner above the chat input. The banner handles
the entire UI — do not describe the plugin yourself.

- Call after search_plugins when a match directly addresses the user's ask
- Do NOT call if the suggestion is not relevant or you're unsure it would help

Parameters:
- `pluginName` (required): Name of the plugin
- `pluginId` (required): Plugin ID from search results

## MCP: Registry (Connectors)

### search_mcp_registry

Search for available connectors to external apps and services.

- Call when the user asks about external apps and Claude doesn't have a matching connector
- Returns results with connected status
- Examples: "check my Asana tasks", "find issues in Jira"

Parameters:
- `keywords` (required): Search keywords in English extracted from user's request

### suggest_connectors

Display connector suggestions to the user with Connect buttons.

- Call after search_mcp_registry when connectors are not yet connected but would help
- Also call when a tool call fails with authentication/credential error
- Do NOT call if the connector is already connected and working

Parameters:
- `uuids` (required): UUIDs of connectors to suggest

## MCP: Claude in Chrome (Browser Automation)

Cowork includes full browser automation via the Chrome extension. All tools are prefixed
with `mcp__Claude_in_Chrome__`. Key tools:

- `tabs_context_mcp` — Get tab IDs (call first before any browser tool)
- `tabs_create_mcp` — Create a new empty tab
- `navigate` — Navigate to URL or go forward/back in history
- `read_page` — Get accessibility tree of page elements
- `find` — Find elements using natural language
- `computer` — Mouse/keyboard interactions and screenshots
- `form_input` — Set values in form elements
- `javascript_tool` — Execute JavaScript in page context
- `get_page_text` — Extract raw text from page
- `read_console_messages` — Read browser console output
- `read_network_requests` — Read HTTP network requests
- `resize_window` — Resize browser window
- `gif_creator` — Record and export GIF of browser session
- `upload_image` — Upload screenshot or image to file input
- `file_upload` — Upload files from local filesystem to page
- `shortcuts_list` / `shortcuts_execute` — List and run browser shortcuts
- `switch_browser` — Switch which Chrome browser is used

## How Cowork's Tool Set Differs from CLI Claude Code

| Capability | CLI Claude Code | Cowork Mode |
|---|---|---|
| Host file access | Direct (user's shell) | Via request_cowork_directory MCP tool |
| File deletion | Direct | Needs allow_cowork_file_delete permission |
| File sharing | File paths | present_files cards + computer:// links |
| Browser automation | Not available (or limited) | Full Chrome MCP with 18+ tools |
| Scheduled tasks | Not available | create/update/list scheduled tasks |
| Plugins | Not available | search_plugins + suggest_plugin_install |
| MCP Connectors | User-configured | Built-in registry search + suggest |
| Sandbox | Optional (dangerouslyDisableSandbox) | Always sandboxed in Linux VM |
| Web content | WebFetch + WebSearch | Same, but NO fallback to curl/wget/python |
