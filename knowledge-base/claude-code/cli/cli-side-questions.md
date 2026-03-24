---
title: "Side Questions: Ephemeral Queries With /btw"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Side Questions With /btw

The `/btw` command lets you ask a quick question without affecting your conversation history. Think of it as a whispered aside to Claude.

## Usage

```
/btw <question>
```

## How It Works

- Claude sees the current conversation context.
- Claude answers the question.
- The question and answer are **discarded** — they do not enter the conversation history.
- Claude **cannot use tools** during a /btw response (no file reads, no edits, no bash).
- Hooks are **not triggered**.

## Examples

```
/btw What's the difference between useEffect and useLayoutEffect?

/btw What does the ?? operator do in TypeScript?

/btw Is this the right place to add input validation?

/btw What HTTP status code should I use for "resource already exists"?
```

## When to Use /btw

- **Quick clarifications** — terminology, syntax, conventions
- **Sanity checks** — "am I on the right track?" without derailing the conversation
- **Learning moments** — "what does this function do?" while Claude is mid-task
- **Avoiding context pollution** — keep the main conversation focused on the task

## When NOT to Use /btw

- When you need Claude to read files or run commands (tools are disabled)
- When the answer should influence the ongoing task (it gets discarded)
- When you want to reference the answer later in the conversation

## Key Points

- `/btw` is ephemeral: question and answer are thrown away after display.
- No tool access: Claude answers from its training knowledge and current context only.
- No hooks fired: side questions are invisible to the hook system.
- Perfect for keeping your main conversation clean while getting quick answers.
