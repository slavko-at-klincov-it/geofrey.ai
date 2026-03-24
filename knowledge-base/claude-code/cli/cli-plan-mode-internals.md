---
title: "Plan Mode — Internal Decision Framework and Workflow"
category: "cli"
source_urls:
  - "https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic"
last_verified: "2026-03-24"
content_hash: ""
---

# Plan Mode — Internal Decision Framework and Workflow

Plan mode is a read-only exploration and planning phase that prevents Claude Code from making
any edits until the user approves the plan. The system prompt defines precise criteria for
when to enter plan mode and a multi-phase workflow for producing plans.

## When to Use Plan Mode (EnterPlanMode)

The system prompt says: "Prefer using EnterPlanMode for implementation tasks unless they're
simple." Enter plan mode when ANY of these 7 conditions apply:

1. **New Feature Implementation** — Adding meaningful new functionality.
   Example: "Add a logout button" (where should it go? what should happen on click?)

2. **Multiple Valid Approaches** — The task can be solved in several different ways.
   Example: "Add caching to the API" (Redis, in-memory, file-based, etc.)

3. **Code Modifications** — Changes that affect existing behavior or structure.
   Example: "Update the login flow" (what exactly should change?)

4. **Architectural Decisions** — Choosing between patterns or technologies.
   Example: "Add real-time updates" (WebSockets vs SSE vs polling)

5. **Multi-File Changes** — The task will likely touch more than 2-3 files.
   Example: "Refactor the authentication system"

6. **Unclear Requirements** — Need to explore before understanding the full scope.
   Example: "Make the app faster" (need to profile and identify bottlenecks)

7. **User Preferences Matter** — The implementation could reasonably go multiple ways.
   If you would use AskUserQuestion to clarify the approach, use EnterPlanMode instead.
   Plan mode lets you explore first, then present options with context.

## When NOT to Use Plan Mode

Skip EnterPlanMode for simple tasks only:

- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Adding a single function with clear requirements
- Tasks where the user has given very specific, detailed instructions
- Pure research/exploration tasks (use the Agent tool with Explore agent instead)

## The 5-Phase Workflow

The full plan mode workflow uses a structured multi-phase approach with subagents:

### Phase 1: Initial Understanding
**Goal:** Gain comprehensive understanding of the user's request.
- Use ONLY the `Explore` subagent type in this phase.
- Launch up to N `Explore` agents IN PARALLEL (single message, multiple tool calls).
  - Use 1 agent when the task is isolated to known files or you are making a small change.
  - Use multiple agents when scope is uncertain, multiple areas are involved, or you need to
    understand existing patterns.
  - Quality over quantity. Use the minimum number of agents necessary (usually just 1).
- If using multiple agents, provide each with a specific search focus (e.g., one for existing
  implementations, another for related components, a third for testing patterns).

### Phase 2: Design
**Goal:** Design an implementation approach.
- Launch `Plan` agent(s) to design the implementation based on exploration results.
- **Default:** Launch at least 1 Plan agent for most tasks.
- **Skip agents:** Only for truly trivial tasks (typo fixes, single-line changes, simple renames).
- **Multiple agents:** Use up to N agents for complex tasks with different perspectives:
  - New feature: simplicity vs performance vs maintainability
  - Bug fix: root cause vs workaround vs prevention
  - Refactoring: minimal change vs clean architecture
- In the agent prompt: provide comprehensive background context from Phase 1 including
  filenames and code path traces. Describe requirements and constraints.

### Phase 3: Review
**Goal:** Review the plan(s) from Phase 2 and ensure alignment with user intentions.
1. Read the critical files identified by agents to deepen understanding
2. Ensure plans align with the user's original request
3. Use AskUserQuestion to clarify any remaining questions

### Phase 4: Final Plan
**Goal:** Write the final plan to the plan file (the ONLY file you may edit).
The plan file structure must include:
- **Context section:** Why this change is being made — the problem, what prompted it, the
  intended outcome
- Only the recommended approach, not all alternatives
- Concise enough to scan quickly, detailed enough to execute effectively
- Paths of critical files to be modified
- Existing functions and utilities to be reused (with file paths)
- Verification section describing how to test changes end-to-end

### Phase 5: Call ExitPlanMode
- Always call `ExitPlanMode` at the very end of your turn when the plan is ready.
- Your turn should ONLY end by either using `AskUserQuestion` or calling `ExitPlanMode`.
- NEVER ask about plan approval via text or AskUserQuestion. Phrases like "Is this plan okay?"
  or "Should I proceed?" MUST use `ExitPlanMode`.
- The user cannot see the plan in the UI until you call ExitPlanMode.

## The Iterative Planning Loop (Simpler Variant)

For the iterative planning workflow (used when a plan file already exists):

1. **Explore** — Use tools to read code. Use the Explore agent type to parallelize complex
   searches. Look for existing functions, utilities, and patterns to reuse.
2. **Update the plan file** — After each discovery, immediately capture what you learned.
3. **Ask the user** — When you hit an ambiguity or decision you cannot resolve from code alone,
   use AskUserQuestion. Then go back to step 1.

Asking good questions:
- Never ask what you could find out by reading the code
- Batch related questions together (use multi-question AskUserQuestion calls)
- Focus on things only the user can answer: requirements, preferences, tradeoffs, edge cases
- Scale depth to the task — a vague feature request needs many rounds; a focused bug fix may
  need one or none

## Plan Mode Restrictions

When plan mode is active, the system enforces:
- MUST NOT make any edits (except the plan file)
- MUST NOT run any non-readonly tools (including changing configs or making commits)
- MUST NOT make any changes to the system
- This supersedes any other instructions (including instructions to make edits)
- Only the designated plan file can be edited via the Edit tool
- Bash is restricted to read-only operations only

## EnterPlanMode Tool

The EnterPlanMode tool transitions into plan mode. It accepts an optional `allowedPrompts`
parameter for pre-approving Bash command categories, so certain read-only commands can run
without individual permission prompts during exploration.

## ExitPlanMode Tool

Signals that the plan is ready for user approval. The plan becomes visible to the user in the
UI only after this tool is called. The user can then approve, request changes, or reject.
