---
id: DEC-006
title: "geofrey is the guardian of the project vision — validates Claude's proposals before user confirms"
status: active
date: "2026-03-28"
project: geofrey
category: architecture
scope: ["brain/monitor.py", "brain/review.py", "brain/orchestrator.py", "brain/observer.py"]
keywords: ["guardian", "vision", "validate", "proposal", "drift", "confirm", "trust", "review", "monitor"]
depends_on: ["DEC-003", "DEC-005"]
enables: []
conflicts_with: []
supersedes: []
---

## Description

geofrey must act as the guardian of the project vision — not just enriching prompts, but actively validating Claude Code's proposals and outputs against the project's decisions, vision, and architecture BEFORE the user sees and confirms them.

The core problem: Users trust Claude's suggestions because they assume Claude understands the full context. Claude proposes changes based on incomplete understanding ("Halbwissen"). The user says "yes" trusting Claude. Claude then builds something that diverges from the intended direction. The user often doesn't notice until much later — sometimes only via a gut feeling that something is wrong.

The 35% "correction rate" observed across 1,999 user messages is NOT the user changing direction — it's the user DISCOVERING that Claude went off course and trying to correct after the fact.

## Rationale

This was discovered during analysis of 1,999 user messages across 29 projects and 124 Claude Code sessions. The user explicitly described the pattern: "Claude macht einen Vorschlag auf Basis von Halbwissen, ich vertraue ihm, sage ja, dann macht er komplett was anderes und manchmal merke ich's gar nicht."

geofrey sits BETWEEN Claude and the user. It has access to: Decision files (what was intentionally decided), project vision (docs/vision.md), session learnings (what was tried before), and the enriched project context. Claude does NOT have this unless geofrey injects it.

The monitor loop must not only check for "done" — it must continuously read Claude's output and flag when proposals diverge from known decisions or the project direction.

## Change Warning

Do NOT reduce the monitor to a passive "wait for done" loop. The monitor's PRIMARY job is to catch when Claude proposes changes that conflict with documented decisions, architectural patterns, or the project vision. Passive monitoring (just polling for completion) defeats the purpose. The monitor must READ Claude's output, MATCH it against decisions, and INTERVENE when divergence is detected.
