---
id: DEC-001
title: "Safety consolidated into gates.py"
status: active
date: "2026-03-26"
project: geofrey
category: architecture
scope: ["brain/gates.py"]
keywords: ["safety", "gates", "validation", "block", "warn"]
depends_on: []
enables: ["DEC-002"]
conflicts_with: []
supersedes: []
---

## Description

Three disconnected safety systems (safety.py, gates.py, inline validation checks) were consolidated into a single `gates.py` module with `[BLOCK]` + `[WARN]` pattern matching.

## Rationale

Safety logic was spread across three places: `brain/safety.py` (RAG-based safety chunks), `brain/gates.py` (pattern matching), and inline checks in orchestrator/daemon. This made the safety model hard to reason about and test. Consolidating into `gates.py` as the single validation layer makes safety deterministic and auditable.

## Change Warning

Do NOT recreate `safety.py`. It was deleted intentionally. All prompt validation lives in `gates.py` with `[BLOCK]` (prevents execution) and `[WARN]` (advisory) patterns. If new safety checks are needed, add them as patterns in `gates.py`.
