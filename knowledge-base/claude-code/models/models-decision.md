---
title: "When to use which model"
category: "models"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Model Decision Guide

Choose models based on task complexity, not habit. Each model has distinct strengths.

## Sonnet (claude-sonnet-4-6)

**Best for:** Most everyday coding tasks.

- Code generation and editing
- File refactoring
- Writing tests
- Explaining code
- Best balance of speed and capability
- Default model for good reason — handles 80%+ of tasks well

**Use when:** You need fast, capable responses for standard development work.

## Opus (claude-opus-4-6)

**Best for:** Hard problems requiring deep reasoning.

- Complex architecture decisions
- Debugging elusive issues (race conditions, memory leaks)
- Multi-file refactors with interdependencies
- Security reviews and vulnerability analysis
- Understanding unfamiliar large codebases

**Use when:** Sonnet's answer isn't good enough, or you know the task is genuinely complex.

## Haiku (claude-haiku-4-5-20251001)

**Best for:** Quick, simple tasks where speed matters most.

- Renaming variables
- Simple search and replace
- Quick questions about syntax
- Generating boilerplate
- Cost-sensitive environments

**Use when:** The task is straightforward and you want the fastest response.

## opusplan

**Best for:** Complex tasks that benefit from planning before execution.

- Opus creates the plan (architecture, approach, steps)
- Sonnet executes each step
- Combines Opus reasoning with Sonnet speed
- Best of both worlds for large features

**Use when:** Building a new feature or making changes that span many files and need a coherent strategy.

## 1M Context Variants (sonnet[1m], opus[1m])

**Best for:** Working with very large codebases or many files simultaneously.

- Large monorepos with many interconnected files
- Tasks requiring awareness of 50+ files
- Long sessions with extensive back-and-forth
- Analysis of large log files or data dumps

**Use when:** Standard context (200K) runs out or you need Claude to hold more of the codebase in memory at once.

## Decision Flowchart (generic reference)

1. Is the task trivial (rename, boilerplate, quick fix)? **Use Haiku.**
2. Is it standard development (feature, test, refactor)? **Use Sonnet.**
3. Does it need a plan then execution across many files? **Use opusplan.**
4. Is it genuinely hard (debugging, architecture, security)? **Use Opus.**
5. Do you need massive context? **Add [1m] to your model choice.**

## geofrey Model Policy (overrides flowchart)

geofrey applies a personal model policy automatically via `config/config.yaml`:

- **Code tasks** (code-fix, feature, refactor): Always **Opus**
- **Analysis tasks** (review, research, security): Always **Opus**
- **Content tasks** (doc-sync, LinkedIn): **Sonnet**

This policy is resolved by Python (`brain/command.py`), not by the LLM.
Model aliases (`opus`, `sonnet`) are version-independent — Claude Code
maps them to the latest available model automatically.
