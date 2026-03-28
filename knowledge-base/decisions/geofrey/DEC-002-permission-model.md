---
id: DEC-002
title: "Permission model flows from SkillMeta through to session"
status: active
date: "2026-03-26"
project: geofrey
category: architecture
scope: ["brain/session.py", "brain/agents/base.py", "brain/daemon.py"]
keywords: ["permission", "skip", "plan", "default", "session"]
depends_on: ["DEC-001"]
enables: []
conflicts_with: []
supersedes: []
---

## Description

The permission model (`skip`, `default`, `plan`) is determined by `SkillMeta` in `router.py` and flows through the entire chain: `SkillMeta` → `agent_config` → `BaseAgent` → `_build_claude_cmd()` in `session.py`.

## Rationale

Previously, permission mode was hardcoded in different places. By deriving it from the skill configuration, each task type gets the appropriate permission level automatically: overnight tasks get `skip` (autonomous), code tasks get `default` (user approves), analysis tasks get `plan` (read-only).

## Change Warning

Do NOT hardcode permission flags in session.py or daemon.py. The permission mode must come from SkillMeta config. If a new permission mode is needed, add it to the skill_defaults in config.yaml.
