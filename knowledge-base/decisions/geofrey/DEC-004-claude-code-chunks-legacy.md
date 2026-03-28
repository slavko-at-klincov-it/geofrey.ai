---
id: DEC-004
title: "77 Claude Code knowledge chunks are legacy — not used in enrichment"
status: active
date: "2026-03-28"
project: geofrey
category: architecture
scope: ["knowledge-base/claude-code/", "knowledge/hub.py", "scripts/embed.py"]
keywords: ["knowledge", "chunks", "claude-code", "rag", "hub", "embed", "legacy"]
depends_on: []
enables: []
conflicts_with: []
supersedes: []
---

## Description

The 77 Claude Code knowledge chunks in knowledge-base/claude-code/ are legacy from the CLI_Maestro era. They were created when Qwen3.5 needed RAG context to understand Claude Code features. With the Python-first architecture, the enrichment pipeline is deterministic — it does NOT query the claude_code ChromaDB collection.

The chunks are only accessible via `geofrey hub-query` (manual CLI command). They do NOT flow into enriched prompts.

## Rationale

The enricher queries: session_learnings (for past learnings), context_personal (for DACH context), decisions (for conflict detection). It does NOT query claude_code. The Python code handles CLI construction, model selection, and permission modes deterministically — no RAG needed.

## Change Warning

Do not invest time maintaining or expanding these 77 chunks for the enrichment pipeline — they are not used there. If the knowledge base is needed for a new purpose, the integration must be explicitly built. Consider deprecating or archiving if no use case emerges.
