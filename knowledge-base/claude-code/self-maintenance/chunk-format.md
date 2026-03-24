---
title: "Knowledge chunk format specification"
category: "self-maintenance"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code"
last_verified: "2026-03-22"
content_hash: ""
---

# Knowledge Chunk Format Specification

Every file in the `knowledge/` directory is a self-contained chunk designed for retrieval-augmented generation (RAG). Following this format ensures consistent embedding quality and reliable retrieval.

## Required Frontmatter

Every chunk must start with YAML frontmatter:

```yaml
---
title: "Descriptive title for retrieval matching"
category: "cli|skills|hooks|permissions|settings|claudemd|models|agents|context|safety|env-vars|workflows|self-maintenance|error-handling|prompt-templates"
source_urls:
  - "https://primary-source-url"
  - "https://secondary-source-url"
last_verified: "YYYY-MM-DD"
content_hash: "sha256 of source content at last verification"
---
```

### Field Details

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Human-readable title. Should contain keywords a user would search for. Used for retrieval matching. |
| `category` | Yes | One of the predefined categories. Must match the subdirectory name. |
| `source_urls` | Yes | One or more URLs where the information was sourced. Used by the update pipeline to check for changes. |
| `last_verified` | Yes | Date when the content was last confirmed accurate against the source. Format: `YYYY-MM-DD`. |
| `content_hash` | Yes | SHA-256 hash of the source content at the time of last verification. Empty string `""` if not yet computed. |

## Content Rules

### Self-contained

Each chunk must fully explain its topic without depending on other chunks. A local LLM reading just this chunk must understand the subject completely. Do not write "see chunk X for details" — that chunk may not be retrieved together.

### Include examples

Every chunk must have at least one practical example. Prefer real-world examples over abstract ones.

```markdown
## Example

To list all available models:
\```bash
claude --model list
\```
```

### Ideal length: 200-500 tokens

- **Too short** (under 200 tokens): Not enough context for the LLM to give a useful answer.
- **Too long** (over 500 tokens): Retrieval quality drops; the embedding represents too many topics.
- **Just right** (200-500 tokens): Focused on one topic with enough detail to be actionable.

If a topic needs more than 500 tokens, split it into multiple chunks, each covering a subtopic.

### Use markdown formatting

Structure content for readability:

- **Headers** (`##`, `###`) to organize sections
- **Code blocks** with language tags for syntax highlighting
- **Tables** for structured comparisons
- **Bullet lists** for options or steps
- **Bold** for emphasis on key terms

### No cross-references

Do not link to or reference other chunks:

```markdown
# BAD
For more on permissions, see permissions/permission-model.md

# GOOD
[Fully explain the relevant permission concept inline]
```

## Example of a Well-Formatted Chunk

```yaml
---
title: "Using --max-turns to limit Claude Code conversation length"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: "a1b2c3d4e5f6..."
---
```

```markdown
# Limiting Conversation Turns with --max-turns

The `--max-turns` flag limits how many back-and-forth turns Claude Code
will take before stopping. This prevents runaway sessions.

## Usage

\```bash
claude -p "Fix the bug" --max-turns 20
\```

If Claude Code reaches the turn limit, it stops and reports what it
accomplished so far.

## Guidelines

| Task Type | Recommended Turns |
|-----------|------------------|
| Simple bug fix | 10-20 |
| Feature implementation | 30-50 |
| Code review | 10-15 |

## Example

\```bash
claude -p "Add input validation to the signup form" \
  --cwd ~/Code/myapp/ \
  --max-turns 30
\```

Always pair `--max-turns` with `--max-budget-usd` for full cost control.
```
