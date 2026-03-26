---
title: "Session Retrospective Patterns"
category: "workflows"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Session Retrospective Patterns

## Concept

Extracting structured learnings from Claude Code sessions to build institutional knowledge. Two approaches:

## gstack's Retro Skill

gstack uses a `/retro` skill that:
- Analyzes the current session's work
- Generates a structured retrospective report
- Tracks learnings globally across sessions
- Feeds insights back into future planning

## geofrey's Session Intelligence (Map-Reduce)

geofrey uses a Map-Reduce pipeline for deeper extraction:

### Map Phase
Each session is parsed from `.jsonl` files, chunked (~2500 chars), and each chunk is sent to the local LLM for extraction into 6 categories:
- **decisions**: Architecture and design choices made
- **bugs**: Bugs found and their fixes
- **discoveries**: New learnings about tools, APIs, or patterns
- **negative_knowledge**: Things that DON'T work (valuable for avoiding repeated mistakes)
- **configuration**: Configuration changes and their reasons
- **patterns**: Recurring code patterns and conventions

### Reduce Phase
Multi-pass consolidation batches 5 chunk results at a time, deduplicates via LLM, and reduces until one consolidated result remains. A 153-turn session with 586 raw items consolidates to ~169 unique learnings in 3 passes.

### Storage
- Markdown files with YAML frontmatter (source of truth) in `knowledge-base/sessions/{project}/`
- Each category embedded separately in ChromaDB `session_learnings` collection for RAG retrieval

## Key Differences

| Aspect | gstack retro | geofrey intelligence |
|---|---|---|
| Execution | In-session, real-time | Post-session, batch |
| Model | Claude (large) | Qwen3.5-9B (local) |
| Depth | Session summary | Category-level extraction |
| Storage | Global tracking | Per-project Markdown + ChromaDB |
| Dedup | Single pass | Multi-pass consolidation |
