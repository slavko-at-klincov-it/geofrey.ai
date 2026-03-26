---
title: "Progressive Context Tiers"
category: "context"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Progressive Context Tiers

## Concept

Not every task needs the same amount of context. Loading the full system prompt, all safety rules, all project docs, and all RAG results into every call wastes context window space — especially critical for smaller models.

## gstack's T1-T4 Tier System

gstack defines four capability tiers, each adding more context:

- **T1 (Basic)**: Core identity, session tracking, basic commands
- **T2 (Standard)**: + project awareness, file context, tool access
- **T3 (Advanced)**: + cross-model review, quality gates, deployment
- **T4 (Full)**: + browser automation, visual testing, deep analysis

Higher tiers unlock more capabilities but consume more context.

## Application for Small Models (9B)

For a 9B model with ~4000 useful chars of context, tiering is essential:

### Tier 1: Always Injected (~500 chars)
- Safety rules (3 chunks, non-negotiable)
- Personal profile (condensed)

### Tier 2: Task-Dependent (~1500 chars)
- Skill-specific system prompt
- Project registry (relevant project only)
- Base rules

### Tier 3: RAG Results (~2000 chars)
- Top 3 relevant knowledge chunks
- Truncated to fit remaining context budget

### Tier 4: Optional Enrichment
- Diff scope summary (one line)
- Session learnings (if relevant to current task)
- Style guide (LinkedIn tasks only)

## Key Principle

Total injected context should be proportional to model capability:
- 9B model: ~4000 chars total (aggressive truncation)
- 70B model: ~8000 chars
- Claude Code: effectively unlimited (200K+ context)

Prioritize: Safety > Task prompt > RAG results > Enrichment
