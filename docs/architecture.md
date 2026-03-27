# geofrey — Architektur

## System-Überblick

geofrey ist ein **autonomer Personal Agent** der lokal auf Slavkos Mac läuft. Er ist kein CLI-Wrapper und kein Chatbot. geofrey ist ein zweites Ich das nie schläft — ein System das den Kontext kennt und besser prompten kann als der User selbst.

**Kernprinzip:** Ein System das den Kontext kennt, kann besser prompten als ich.

**Beweis:** 17 Zeichen User-Input → 14.436 Zeichen angereicherter Prompt. Deterministisch, ohne LLM.

geofrey basiert auf drei Säulen:

1. **Prompt Enrichment** — Jeden User-Input automatisch mit Projekt-Kontext, Architektur, Session-Learnings, DACH-Kontext und Regeln anreichern
2. **Session Automation** — Claude Code Sessions via tmux starten, überwachen, Output capturen, Learnings extrahieren
3. **Overnight Agent** — Task Queue abarbeiten während der User schläft, Morning Briefing generieren

## Architektur-Diagramm

```
User Input → Prompt Enrichment Engine → Session Manager → Claude Code CLI
                     ↓                         ↓
              Knowledge Layer            Overnight Daemon
              (ChromaDB, Learnings)      (Task Queue, Agents)
                                               ↓
                                         Morning Briefing
```

## Die drei Säulen

### Säule 1: Prompt Enrichment

User tippt "fix den login bug" (17 Zeichen). geofrey macht daraus einen 14.436-Zeichen Prompt mit:
- Git-Status und Branch
- Letzte 5 Commits
- Diff Scope (welche Dateien geändert, kategorisiert)
- CLAUDE.md des Projekts
- Architecture-Docs
- Session-Learnings aus früheren Sessions
- DACH-Kontext (DSGVO, NIS2) wenn relevant
- Task-spezifische Regeln und Post-Actions

**Wichtig:** Das ist KEIN LLM-Call. Die Enrichment-Pipeline ist deterministisch — Python sammelt Kontext, wendet Regeln an, baut den Prompt zusammen. Kein Qwen3.5, kein Ollama.

```
User Input (17 chars)
  → Python: detect_task_type()        # Keyword-Matching (router.py)
  → Python: get_skill_meta()          # Config-basierte Defaults (router.py)
  → Python: gather_project_context()  # Git, Docs, ChromaDB (context_gatherer.py)
  → Python: load_enrichment_rules()   # YAML-basierte Regeln (enricher.py)
  → Python: _build_enriched_prompt()  # Alles zusammenbauen (enricher.py)
  → Result: EnrichedPrompt (14.436 chars)
```

### Säule 2: Session Automation

Claude Code Sessions werden nicht mehr manuell gestartet. geofrey:
1. Startet Sessions in tmux (`claude --dangerously-skip-permissions`)
2. Überwacht den Session-Status
3. Captured den Output nach Abschluss
4. Extrahiert Learnings via Session Intelligence Pipeline
5. Aktualisiert die Knowledge Base

```
EnrichedPrompt
  → tmux new-session (session.py)
  → claude --dangerously-skip-permissions -p "..." --model opus --cwd /path
  → Session läuft (monitoring via tmux has-session)
  → capture-pane nach Abschluss
  → Session Intelligence (intelligence.py) → Learnings extrahieren
  → ChromaDB + Markdown Update
```

### Säule 3: Overnight Agent

Der User queued Tasks tagsüber. Nachts um 02:00 startet der Daemon:

```
Task Queue (SQLite)
  → Daemon (launchd, 02:00)
  → Für jeden Task:
      → detect_task_type()
      → enrich_prompt()
      → run_agent() (Claude Code via tmux)
      → update_task() (Status: done/failed/needs_input)
  → generate_briefing()
  → save_briefing() → ~/.knowledge/briefing.md + briefing.json
```

Der User wacht auf und findet ein Morning Briefing:
- Was erledigt wurde
- Was zur Freigabe bereitsteht (Code-Änderungen)
- Wo Input gebraucht wird (Fragen die der Agent nicht beantworten konnte)
- Projekt-Status Übersicht

## Modul-Map

### brain/ — Kernlogik

| Modul | Rolle |
|---|---|
| `models.py` | Shared Dataclasses: Task, Session, EnrichedPrompt, BriefingItem, EnrichmentRule |
| `enricher.py` | Prompt Enrichment Engine: Regeln laden, Kontext sammeln, Prompt bauen |
| `context_gatherer.py` | Kontext sammeln: Git-Status, CLAUDE.md, ChromaDB, Diff Scope |
| `session.py` | Session Manager: tmux starten/überwachen/capturen, sync Execution |
| `queue.py` | Task Queue: SQLite-Backend, CRUD, Priority-Ordering |
| `daemon.py` | Overnight Daemon: Queue abarbeiten, Briefing generieren, launchd Plist |
| `briefing.py` | Morning Briefing: Tasks kategorisieren, Terminal-Formatierung, JSON/MD Export |
| `orchestrator.py` | Legacy Orchestrator: chat(), single_task(), generate_prompt() |
| `command.py` | CommandSpec + build_command(): deterministischer CLI-Bau |
| `router.py` | Task-Type Detection: Keyword-Matching (DE+EN), SkillMeta aus Config |
| `gates.py` | validate_prompt(): Secrets/Dangerous Pattern Check |
| `scope.py` | Diff Scope Detection: git-Änderungen kategorisieren |
| `prompts.py` | Template-Loader: load_template(), render_template() |
| `decision_checker.py` | Decision Conflict Detection: Scope, Keyword, Semantic Matching |
| `linkedin.py` | LinkedIn Post Pipeline |
| `agents/` | Agent-System: BaseAgent, Factory-Dispatcher, spezialisierte Agents |
| `rules/` | Enrichment Rules als YAML: pro Task-Typ konfigurierbar |
| `skills/` | Skill-Templates: leiten LLM beim Prompt-Schreiben an |
| `templates/` | LLM-System-Prompts als Markdown |

### knowledge/ — Wissensschicht

| Modul | Rolle |
|---|---|
| `hub.py` | Zentrale Knowledge API |
| `store.py` | ChromaDB Wrapper (multi-collection) |
| `ingest.py` | Document Loading + Chunking + Embedding |
| `context.py` | DACH Personal Context Manager |
| `linkedin.py` | LinkedIn Post Ingestion + Style Guide |
| `sessions.py` | Claude Code Session Pipeline + Inbox |
| `intelligence.py` | Session Intelligence: Map-Reduce Learnings Extraction |
| `decisions.py` | Decision Storage, Retrieval, Semantic Search, Dependency Walker |

## Datenfluss

### Interaktiver Task (User wartet)

```
1. User: "fix den login bug in meus"
2. router.py:    detect_task_type("fix den login bug in meus") → "code-fix"
3. router.py:    get_skill_meta("code-fix", config) → SkillMeta(model="opus", budget=5, turns=30)
4. enricher.py:  load_enrichment_rules() → rules["code-fix"] (aus brain/rules/code-fix.yaml)
5. context_gatherer.py: gather_project_context(~/Code/Meus, "meus", config)
   → Git branch, status, commits, diff scope
   → CLAUDE.md lesen
   → ChromaDB: session_learnings abfragen
6. enricher.py:  _build_enriched_prompt(user_input, context, rule, dach_context)
   → 14.436 Zeichen strukturierter Prompt
7. command.py:   build_command(CommandSpec(prompt=..., model="opus", cwd=~/Code/Meus, budget=5))
   → claude --model opus --cwd ~/Code/Meus -p "..." --max-budget-usd 5.00
8. gates.py:     validate_prompt(prompt) → OK (keine Secrets, keine Dangerous Patterns)
9. User:         Bestätigung
10. Execution:   subprocess.run(claude ...)
```

### Overnight Task (User schläft)

```
1. User (tagsüber): geofrey queue add "refactor auth module" --project meus --priority high
2. SQLite:           Task gespeichert (pending, priority=3)
3. Daemon (02:00):   run_overnight()
4. daemon.py:        get_pending_tasks() → [Task(refactor auth...)]
5. daemon.py:        Für jeden Task:
   → detect_task_type() → "refactor"
   → get_skill_meta() → SkillMeta(model="opus", needs_plan=True)
   → enrich_prompt() → EnrichedPrompt
   → run_agent() → Claude Code via tmux
   → update_task(status=done, result="...")
6. briefing.py:      generate_briefing() → MorningBriefing
7. briefing.py:      save_briefing() → ~/.knowledge/briefing.md
8. User (morgens):   geofrey briefing → Liest Morning Briefing
```

## Enrichment Pipeline (Detail)

Die Enrichment Pipeline ist das Herzstück von geofrey. Sie verwandelt kurze User-Inputs in vollständige, kontextreiche Prompts.

### Enrichment Rules

Pro Task-Typ gibt es eine YAML-Regel in `brain/rules/`:

```yaml
# brain/rules/code-fix.yaml
task_type: code-fix
include_git_status: true
include_recent_commits: true
include_claude_md: true
include_architecture: false
include_session_learnings: true
include_dach_context: false
include_diff_scope: true
post_actions:
  - "Run existing tests to verify the fix"
  - "Document the root cause in a brief comment"
prompt_suffix: "Investigate root cause before fixing. Do not just patch symptoms."
```

7 Regeln definiert: code-fix, feature, refactor, review, research, security, doc-sync.

### Kontext-Quellen

| Quelle | Methode | Wann |
|---|---|---|
| Git Branch | `git branch --show-current` | Immer (außer research) |
| Git Status | `git status --short` | Immer (außer research) |
| Recent Commits | `git log --oneline -5` | Immer (außer research) |
| Diff Scope | `brain/scope.py` — kategorisiert geänderte Files | Immer (außer research) |
| CLAUDE.md | Datei lesen aus Projekt-Root | Immer (außer research) |
| Architecture | `docs/architecture.md` lesen | Bei feature, refactor, review, security, doc-sync |
| Session Learnings | ChromaDB `session_learnings` Collection | Immer |
| DACH-Kontext | ChromaDB `context_personal` Collection | Bei review, research, security |
| Decision Context | `knowledge/decisions.py` + ChromaDB `decisions` Collection | Immer (include_decision_context: true) |

### Prompt-Struktur (Output)

```markdown
## Task
fix den login bug

Investigate root cause before fixing. Do not just patch symptoms.

## Project Context
Branch: main
Recent changes:
 M src/auth/login.py
 M tests/test_auth.py
Recent commits:
abc1234 feat: add OAuth2 support
def5678 fix: session timeout handling
Diff scope: backend: 1 file, tests: 1 file

## Architecture
[Inhalt von CLAUDE.md oder docs/architecture.md]

## Known Context from Previous Sessions
[Learnings aus ChromaDB]

## Active Decisions
The following active decisions are relevant to this task.
Do NOT contradict these without explicit user approval.

- **DEC-001: Safety consolidated into gates.py** [architecture]
  Rationale: Three disconnected safety systems
  ⚠ WARNING: Do not recreate safety.py — consolidated by design

## Requirements
After completing:
- Run existing tests to verify the fix
- Document the root cause in a brief comment
```

## Session Lifecycle

```
1. Start:     tmux new-session -d -s geofrey-{id} "claude --dangerously-skip-permissions ..."
2. Monitor:   tmux has-session -t geofrey-{id} → RUNNING / COMPLETED
3. Capture:   tmux capture-pane -t geofrey-{id} -p -S -200
4. End:       capture + tmux kill-session
5. Learn:     Session Intelligence → Learnings extrahieren (Map-Reduce mit Qwen3.5)
6. Persist:   Markdown + ChromaDB Update
```

## Knowledge Layer

### ChromaDB Collections

Alle persistent unter `~/.knowledge/vectordb/`:

| Collection | Inhalt | Update |
|---|---|---|
| `claude_code` | 110 Chunks Claude Code Expertenwissen | Täglich (Cron 03:00) |
| `context_personal` | DACH-Kontext (Profil, DSGVO, NIS2, EU Data Boundary) | Manuell |
| `knowledge` | Allgemeine Recherche-Ergebnisse | Nach jeder Session / Inbox |
| `linkedin_style` | LinkedIn Posts als Stil-Referenz | Nach jedem bestätigten Post |
| `sessions` | Claude Code Session-Summaries | Automatisch |
| `session_learnings` | Extrahierte Learnings (Decisions, Bugs, Discoveries, Patterns) | Nach `learn` Command |
| `decisions` | Architektur-Entscheidungen mit Dependencies, Scope, Warnings | Nach `decisions index` oder `learn` |

### Source of Truth

Markdown-Dateien in `knowledge-base/` sind die Source of Truth. ChromaDB ist wegwerfbar und kann jederzeit aus den Markdown-Dateien neu aufgebaut werden (`python main.py embed --reset`).

## Model-Policy

Konfiguriert in `config/config.yaml`:

| Kategorie | Modell | Tasks |
|---|---|---|
| Code | Opus | code-fix, feature, refactor |
| Analysis | Opus | review, research, security |
| Content | Sonnet | doc-sync, LinkedIn |

User hat Max 20x Plan (~$200/Monat). Kosten sind kein Faktor — Qualität geht vor.

## Konfiguration (config.yaml)

| Bereich | Was konfigurierbar ist |
|---|---|
| `model_policy` | Welches Modell pro Kategorie (code, analysis, content) |
| `skills` | Budget, Turns, Permission-Mode, Plan-Phase pro Skill |
| `paths` | vectordb, knowledge-base, projects |
| `embedding` | Modell und Chunk-Größe |
| `llm` | Ollama-Modell für lokale Generierung |

## Safety & Permission Model

### Wo welche Checks passieren

| Layer | Check | Modul |
|---|---|---|
| **Pre-Enrichment** | Task-Type Detection (deterministisch) | `router.py` |
| **Enrichment** | Regeln bestimmen welcher Kontext geladen wird | `enricher.py` |
| **Post-Enrichment** | [BLOCK] + [WARN] Pattern Check (Secrets, rm -rf /, drop database, force push) | `gates.py` |
| **Command-Bau** | --cwd, --model, --budget werden von Python garantiert | `command.py` |
| **Permission** | `permission_mode` aus SkillMeta → `_build_claude_cmd()` in session.py | `session.py` |
| **Pre-Execution** | User-Bestätigung (interaktiv) oder Agent-Autonomie (overnight) | `orchestrator.py` / `daemon.py` |
| **Session** | Permission-Modus pro Skill (skip/default/plan) | `session.py` |

### Permission Model (session.py)

| Modus | Flag | Wann |
|---|---|---|
| `skip` | `--dangerously-skip-permissions` | Autonomous overnight execution |
| `default` | (kein Flag) | Interactive — User approves |
| `plan` | `--permission-mode plan` | Read-only analysis |

Der Daemon übergibt `permission_mode` aus SkillMeta → agent_config → BaseAgent → `_build_claude_cmd()`.

### Non-Negotiable

- Keine Secrets in Prompts (validate_prompt prüft automatisch)
- [BLOCK] Patterns verhindern Execution (rm -rf /, drop database, force push main)
- --cwd immer gesetzt (Python garantiert, nicht LLM)
- Budget-Limits immer gesetzt
- Overnight: nur in tmux, isoliert, mit Budget-Limit
- Briefing Memory: `mark_briefing_shown()` trackt letztes Briefing, Summary nur neue Tasks

## Decision Dependency System

AI Coding Assistants wissen nicht WARUM Code so ist wie er ist. Das führt zu Loops wo Claude bewusste Entscheidungen rückgängig macht. geofrey löst das durch deterministische Decision Injection vor dem LLM.

Siehe [docs/decision-dependency-system.md](decision-dependency-system.md) für die vollständige Research.

### Wie es funktioniert

```
User Input: "fix the safety system"
  → context_gatherer.py: gather_decision_context()
    → git diff → affected files: [brain/gates.py]
    → decision_checker.py: check_decision_conflicts()
      → Level 1: Scope match (brain/gates.py → DEC-001)
      → Level 2: Keyword match ("safety" → DEC-001)
      → Level 3: Semantic match (ChromaDB embedding similarity)
      → walk_dependency_chain(DEC-001) → [DEC-001, DEC-002]
    → format_decision_context() → Warning Text
  → enricher.py: "## Active Decisions" Section im Prompt
  → Claude bekommt den Kontext VOR dem Reasoning
```

### Architektur

| Komponente | Modul | Rolle |
|---|---|---|
| Decision Dataclass | `brain/models.py` | Datenmodell mit Dependencies, Scope, Warnings |
| Storage + Retrieval | `knowledge/decisions.py` | Laden, Embedden, Semantic Search, Dependency Walker |
| Conflict Detection | `brain/decision_checker.py` | 3-Level Matching: Scope, Keyword, Semantic |
| Context Gathering | `brain/context_gatherer.py` | `gather_decision_context()` für den Enricher |
| Prompt Injection | `brain/enricher.py` | `## Active Decisions` Section |
| Auto-Extraction | `knowledge/intelligence.py` | Strukturierte Decisions aus Sessions extrahieren |
| Source of Truth | `knowledge-base/decisions/` | Markdown + YAML Frontmatter pro Projekt |

### Decision Format

```markdown
---
id: DEC-001
title: "Safety consolidated into gates.py"
status: active
date: "2026-03-26"
project: geofrey
category: architecture
scope: ["brain/gates.py"]
keywords: ["safety", "gates", "validation"]
depends_on: []
enables: ["DEC-002"]
---

## Rationale
Three disconnected safety systems (safety.py, gates.py, inline checks)
were consolidated into a single gates.py with [BLOCK] + [WARN] patterns.

## Change Warning
Do NOT recreate safety.py. All safety logic lives in gates.py.
```

### Lifecycle

```
Session Intelligence extrahiert Decision → Markdown-File in knowledge-base/decisions/
  → index_decisions() → ChromaDB "decisions" Collection
  → Nächster Task → gather_decision_context() findet relevante Decisions
  → Prompt enthält Warnings → Claude revertiert keine bewussten Entscheidungen
```

## CLI Commands

```bash
# Interaktiv
geofrey chat                              # Orchestrator-Modus
geofrey task "fix login in meus"          # Single Task mit Enrichment

# LinkedIn
geofrey post "NIS2 für KMU"              # Post-Generierung Pipeline

# Task Queue
geofrey queue add "refactor auth" --project meus --priority high
geofrey queue list                        # Alle Tasks anzeigen
geofrey queue list --status done          # Nach Status filtern
geofrey queue process                     # Pending Tasks abarbeiten

# Overnight + Briefing
geofrey overnight                         # Voller Overnight-Zyklus
geofrey briefing                          # Morning Briefing anzeigen
geofrey install-daemon                    # launchd Plist generieren

# Knowledge
geofrey learn                             # Session Learnings extrahieren
geofrey learnings                         # Learnings anzeigen
geofrey status                            # Collections + Chunks
geofrey embed                             # Knowledge Base embedden
geofrey skills                            # Verfügbare Skills

# Decisions
geofrey decisions list [--project X]      # Aktive Decisions anzeigen
geofrey decisions check "task" --project X  # Conflict Check
geofrey decisions index --project X       # Re-Index in ChromaDB

# Utilities
geofrey context-setup                     # DACH-Kontext importieren
geofrey linkedin-ingest                   # LinkedIn Posts importieren
geofrey sessions-ingest                   # Claude Code Sessions importieren
geofrey hub-query "DSGVO"                 # RAG-Suche
```
