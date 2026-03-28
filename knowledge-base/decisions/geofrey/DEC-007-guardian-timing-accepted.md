---
id: DEC-007
title: "Guardian timing gap in overnight mode is accepted — two defense layers suffice"
status: active
date: "2026-03-28"
project: geofrey
category: architecture
scope: ["brain/monitor.py"]
keywords: ["guardian", "timing", "overnight", "monitor", "poll", "skip"]
depends_on: ["DEC-006"]
enables: []
---

## Description

The Guardian monitor polls tmux output every 10 seconds. In overnight mode (permission_mode=skip), Claude can commit changes in 2-3 seconds — faster than the monitor can detect. This timing gap is a known limitation.

## Rationale

Two defense layers make this acceptable:
1. **Pre-execution** (1st defense): Decisions are injected INTO the prompt before Claude starts. Claude sees "Do NOT move auth.py" before it begins working.
2. **Post-execution** (2nd defense): Monitor detects changes after the fact and logs warnings for the morning briefing.

In interactive mode (permission_mode=default), timing is not a problem because Claude asks for confirmation before each change, giving the monitor time to intervene.

Option D (hybrid plan-phase before overnight execution) was considered but deferred as not acutely needed.

## Change Warning

Do NOT remove the prompt-level decision injection (enricher.py) thinking the monitor will catch conflicts at runtime. The monitor is the SECOND defense line. The prompt injection is the FIRST and more reliable one.
