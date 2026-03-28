---
id: DEC-005
title: "Intent understanding requires LLM — keyword matching is insufficient"
status: active
date: "2026-03-28"
project: geofrey
category: architecture
scope: ["brain/orchestrator.py", "brain/router.py", "brain/enricher.py"]
keywords: ["intent", "routing", "keyword", "llm", "orchestrator", "understand", "dynamic", "qwen", "chat"]
depends_on: ["DEC-003"]
enables: []
conflicts_with: []
supersedes: []
---

## Description

User intent understanding is inherently dynamic — it cannot be reduced to static keyword matching. The orchestrator needs an LLM layer between user input and the deterministic enrichment pipeline to understand what the user actually wants, handle follow-ups, resolve ambiguity, decompose multi-step tasks, and filter relevant context.

## Rationale

During the Python-First Architecture push (2026-03-25), the orchestrator's LLM involvement was removed as collateral damage. "Python-First" was meant to make CLI construction deterministic — not to remove intent understanding. The reduction to keyword-based routing created a system that can only handle explicit, keyword-rich inputs. Real user inputs are ambiguous, contextual, and conversational.

Examples of what keyword matching cannot handle:
- "die Login-Seite geht nicht mehr" → no keywords match, falls to default
- "schau dir mal die Auth an" → could be review, fix, or exploration
- "jetzt auch die Registrierung fixen" → follow-up reference, needs conversation memory
- "erst recherchieren, dann implementieren" → multi-step task decomposition

This decision was discovered by the user during a critical review on 2026-03-28, when they asked why the system uses only static Python for understanding dynamic human input. The irony: geofrey was built to prevent exactly this kind of undocumented architectural regression — and it happened to geofrey itself because the Decision System didn't exist when the regression occurred.

## Change Warning

Do NOT remove or bypass the LLM intent layer in the orchestrator. The keyword-based router (brain/router.py) should remain as a FALLBACK for when the LLM is unavailable, not as the primary routing mechanism. The LLM layer handles: intent classification, ambiguity resolution, follow-up detection, task decomposition, and context relevance filtering. Static Python handles everything AFTER intent is understood: context gathering, decision checking, prompt building, command construction.
