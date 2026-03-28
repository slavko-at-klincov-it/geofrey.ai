---
id: DEC-003
title: "Learning loop requires both LLM extraction and embedding retrieval"
status: active
date: "2026-03-28"
project: geofrey
category: architecture
scope: ["knowledge/intelligence.py", "knowledge/hub.py", "knowledge/store.py", "brain/context_gatherer.py", "knowledge/decisions.py"]
keywords: ["ollama", "embedding", "learning", "extraction", "chromadb", "session", "intelligence", "qwen", "nomic", "embed", "vector"]
depends_on: []
enables: []
conflicts_with: []
supersedes: []
---

## Description

geofrey's learning loop is a closed cycle: sessions produce learnings, learnings are indexed, future sessions receive those learnings as context. This cycle requires TWO capabilities: LLM reasoning (to extract structured learnings from session transcripts) and embedding (to index and retrieve learnings via semantic search in ChromaDB).

## Rationale

The learning loop is geofrey's core differentiator — it's what makes "fresh session with enriched context > long session with context drift" true. Without it, geofrey is just a prompt builder. With it, geofrey accumulates project knowledge over time.

The cycle:
1. Session completes → JSONL transcript exists
2. LLM extracts learnings (decisions, bugs, patterns) from transcript → needs ollama.chat() or Claude CLI
3. Learnings indexed in ChromaDB → needs embedding model
4. Next session → enricher queries session_learnings collection → needs embedding model
5. "## Known Context from Previous Sessions" injected into prompt

Breaking any step breaks the entire cycle.

## Change Warning

Do NOT remove the LLM (ollama.chat or equivalent) without providing an alternative extraction mechanism (e.g. Claude Code CLI session). Do NOT remove the embedding model without providing an alternative retrieval mechanism (e.g. ChromaDB built-in embeddings, keyword search). The learning loop is geofrey's reason to exist — removing it silently degrades the system to a stateless prompt builder.
