# geofrey — Autonomer Personal Agent

## Was geofrey ist

geofrey ist Slavkos autonomer Personal Agent — ein zweites Ich das nie schläft. geofrey kennt den User, seinen DACH-Markt, seine Projekte, seinen Schreibstil, und reichert jeden Input automatisch mit dem richtigen Kontext an. Ein System das den Kontext kennt, kann besser prompten als der User selbst.

**Beweis:** 17 Zeichen User-Input → 3.100+ Zeichen angereicherter Prompt inkl. User-Profil, Decisions, und Claude Code Best Practices.

geofrey ist KEIN CLI-Wrapper und KEIN Chatbot. geofrey ist ein autonomer Agent der:
1. User-Intent per LLM versteht und professionelle Task-Briefs schreibt (Intent Layer)
2. Jeden Task mit Projekt-Kontext, Decisions, Learnings und User-Profil anreichert (Enrichment)
3. Claude Code Sessions überwacht und gegen Decisions validiert (Guardian Monitor)
4. Nach Abschluss das Ergebnis triagiert und Quality Review durchführt (Observer + Review)
5. Tasks über Nacht abarbeitet, recherchiert und ein Morning Briefing bereitstellt (Overnight)

## Architektur — Vier Layer

```
User Input
  │
  ▼
Layer 1: BRAIN (Qwen3.5-9B via Ollama)
  │  → understand_intent() — versteht was der User will
  │  → Task-Brief (LLM schreibt 2-3 Sätze statt raw Input)
  │  → Subtask-Decomposition bei Multi-Step Tasks
  │  → Fallback: Keyword-Router wenn Ollama nicht läuft
  │
  ▼
Layer 2: ENRICHMENT (deterministisch, Python)
  │  → gather_project_context() — Git, CLAUDE.md, Diff Scope
  │  → gather_personal_context() — User-Profil (immer)
  │  → gather_decision_context() — aktive Decisions prüfen
  │  → gather_claude_code_context() — Best Practices aus KB
  │  → validate_prompt() — Safety Gates ([BLOCK] + [WARN])
  │  → build_command() — Claude Code CLI deterministisch
  │
  ▼
Layer 3: EXECUTION (Claude Code CLI via tmux)
  │  → start_session() — tmux + /remote-control
  │  → monitor_session() — Guardian überwacht aktiv:
  │     → Proposal Detection (gegen Decisions prüfen)
  │     → Scope Drift Warnung
  │     → User-Korrekturen mit Decision-Kontext weiterleiten
  │  → Quality Review nach Abschluss (Fragen an Claude)
  │
  ▼
Layer 4: OBSERVATION (Qwen3.5 + Python)
     → observe_output() — Erfolg/Fehler/Follow-up erkennen
     → extract_session() — Learnings extrahieren (Map-Reduce)
     → Learnings + Decisions indexieren → nächste Session profitiert
```

**LLM macht DYNAMISCHE Logik:** Intent verstehen, Ambiguität auflösen, Output triagieren.
**Python macht DETERMINISTISCHE Logik:** Kontext sammeln, Prompt bauen, CLI konstruieren, Safety Gates.

**Model-Policy** (config/config.yaml):
- Code-Tasks (code-fix, feature, refactor): **Opus**
- Analysis-Tasks (review, research, security): **Opus**
- Content-Tasks (doc-sync, LinkedIn): **Sonnet**
- Overnight Research: **Sonnet** (günstiger)

## Vorgänger-Projekte (jetzt Teil von geofrey)

| Altes Projekt | Was es war | Was davon in geofrey kommt |
|---|---|---|
| CLI_Maestro | Claude Code Orchestrator | Orchestrator-Logik, Knowledge Chunks, Safety-System, Prompt-Architektur |
| knowledge-assistant | RAG-System mit Chat | Knowledge Hub, Multi-Collection ChromaDB, DACH-Kontext, Ingestion Pipeline |
| LinkedIn_Automat | Post-Daten Pipeline | 38+ geparste Posts, Style Guide, Post-Generierung |

## Tech Stack

- **Sprache:** Python 3.12+ (Backend), Swift/SwiftUI (native macOS UI — Phase 2)
- **LLM:** Qwen3.5-9B via Ollama (Intent, Extraction, Observation)
- **Embeddings:** nomic-embed-text via Ollama
- **Vector Store:** ChromaDB (persistent unter ~/.knowledge/vectordb/)
- **Externe KI:** Claude Code (via CLI — User bringt eigenes Abo)
- **Hardware:** MacBook Pro M3 Pro, 18GB RAM
- **Kein LangChain** — direkte Ollama + ChromaDB Calls

## Projektstruktur

```
geofrey/
├── brain/                    # Agent-Logik (4 Layer)
│   ├── models.py             # Dataclasses: Task, Session, EnrichedPrompt, Decision, ConversationTurn, ...
│   ├── intent.py             # LLM Intent Layer: versteht User-Input, Task-Brief, Subtasks
│   ├── enricher.py           # Prompt Enrichment Engine: Regeln laden, Kontext sammeln, Prompt bauen
│   ├── context_gatherer.py   # Kontext: Git, CLAUDE.md, ChromaDB, Decisions, Personal Profile
│   ├── decision_checker.py   # Decision Conflict Detection (Scope, Keyword, Semantic)
│   ├── monitor.py            # Guardian Monitor: überwacht Claude Sessions, prüft gegen Decisions
│   ├── observer.py           # Output Observer: triagiert Erfolg/Fehler/Follow-up (LLM)
│   ├── review.py             # Quality Review: Post-Actions → Prüffragen an Claude
│   ├── session.py            # Session Manager: tmux starten/überwachen/capturen
│   ├── queue.py              # Task Queue: SQLite-Backend, CRUD, Priority, Orphan-Recovery
│   ├── daemon.py             # Overnight Daemon: Research + Queue + Briefing (launchd 02:00)
│   ├── briefing.py           # Morning Briefing: Tasks kategorisieren, Terminal + JSON/MD Export
│   ├── researcher.py         # Overnight Research: Web-Suche via Claude Code Sonnet
│   ├── questions.py          # Proaktive Fragen: geofrey lernt den User kennen
│   ├── preflight.py          # Pre-Flight Checks: Claude, tmux, Ollama, Dirs
│   ├── agents/               # Agent-System
│   │   └── base.py           # BaseAgent + Factory-Dispatcher (run_agent)
│   ├── rules/                # Enrichment Rules als YAML (7 Task-Typen)
│   ├── orchestrator.py       # Orchestrator: interactive(), single_task(), execute_spec()
│   ├── command.py            # CommandSpec + build_command() — deterministischer Command-Bau
│   ├── router.py             # Task-Type Detection + SkillMeta (7 Skills, DE+EN Keywords)
│   ├── gates.py              # validate_prompt() — [BLOCK] + [WARN] Pattern Check
│   ├── scope.py              # Diff Scope Detection (git-Änderungen kategorisieren)
│   ├── prompts.py            # Template-Loader (load_template, render_template)
│   ├── linkedin.py           # LinkedIn Post Pipeline
│   ├── templates/            # LLM-Prompts: intent.md, observe.md, session-extract.md, ...
│   └── skills/               # Skill-Templates: Anweisungen pro Task-Typ
├── knowledge/                # Knowledge Hub
│   ├── hub.py                # Zentrale API (kein LangChain)
│   ├── store.py              # ChromaDB Wrapper (multi-collection)
│   ├── ingest.py             # Document Loading + Chunking + Embedding
│   ├── context.py            # DACH Personal Context Manager
│   ├── linkedin.py           # LinkedIn Post Ingestion + Style Guide
│   ├── sessions.py           # Claude Code Session Pipeline + Inbox
│   ├── intelligence.py       # Session Intelligence — Learnings aus Sessions extrahieren
│   └── decisions.py          # Decision Storage + Retrieval + Dependency Walker
├── knowledge-base/           # Source of Truth (Markdown, ChromaDB ist wegwerfbar)
│   ├── claude-code/          # 77 Chunks über Claude Code Best Practices
│   ├── context/              # User-Profil, DACH-Kontext (Profil, DSGVO, NIS2, etc.)
│   ├── sessions/             # Extrahierte Session-Learnings pro Projekt
│   ├── decisions/            # Decision Log pro Projekt (7 Decisions für geofrey)
│   └── research/             # Overnight Research Findings
├── tests/                    # ~284 Tests in 9 Dateien + Acceptance Test Harness (50 UCs)
├── config/
│   ├── config.yaml           # Modelle, Pfade, Skill-Defaults (kein max_budget_usd)
│   ├── projects.yaml         # Projekt-Registry (6 Projekte)
│   └── interests.yaml        # Overnight Research Interessen (6 Themen)
├── main.py                   # CLI Entry Point (25+ Commands)
├── requirements.txt
└── CLAUDE.md                 # Diese Datei
```

## CLI Commands

```bash
# Interaktiv
geofrey chat                              # Orchestrator-Modus (mit LLM Intent)
geofrey task "fix login in meus"          # Single Task mit Enrichment

# LinkedIn
geofrey post "NIS2 für KMU"              # Post-Generierung Pipeline

# Task Queue
geofrey queue add "refactor auth" --project meus --priority high
geofrey queue list [--status done]        # Tasks anzeigen
geofrey queue process                     # Pending Tasks abarbeiten

# Overnight + Briefing
geofrey overnight                         # Research + Queue + Briefing
geofrey briefing                          # Morning Briefing anzeigen

# Knowledge
geofrey learn                             # Session Learnings extrahieren
geofrey learnings [project] [--query]     # Learnings anzeigen/suchen
geofrey status                            # Collections + Chunks
geofrey skills                            # Verfügbare Skills

# Decisions
geofrey decisions list [--project X]      # Aktive Decisions anzeigen
geofrey decisions check "task" --project X  # Conflict Check
geofrey decisions index --project X       # Re-Index in ChromaDB

# Projekte
geofrey add-project NAME [--stack X] [--init]  # Neues Projekt + Git + GitHub

# Proaktives Lernen
geofrey questions                         # geofrey's Fragen an dich
geofrey answer <id>                       # Frage beantworten

# Research Interessen
geofrey interests                         # Overnight-Themen anzeigen
geofrey interests add "Thema"             # Thema hinzufügen

# Autonomous Operation
geofrey preflight                         # Pre-Flight Checks
geofrey install-daemon                    # launchd Plist generieren
```

## Guardian System (DEC-006)

geofrey überwacht Claude Code Sessions AKTIV und warnt wenn Claude abdriftet:

1. **Proposal Detection:** Erkennt wenn Claude strukturelle Änderungen vorschlägt ("I'll move auth.py...")
2. **Decision Matching:** Prüft Vorschläge gegen aktive Decisions (DEC-001 bis DEC-007)
3. **Scope Drift:** Warnt wenn zu viele Dateien für die Aufgabe geändert werden
4. **User Correction:** Bei Warnung kann der User korrigieren — geofrey sendet die Korrektur MIT Decision-Kontext an Claude
5. **Quality Review:** Nach Abschluss stellt geofrey Prüffragen (aus Post-Actions + Decisions)

## ChromaDB Collections

Alle in `~/.knowledge/vectordb/` (shared):

| Collection | Inhalt | Update-Frequenz |
|---|---|---|
| `claude_code` | 77 Chunks Claude Code Expertenwissen | Täglich (Cron 03:00) |
| `context_personal` | User-Profil, DACH-Kontext (Profil, DSGVO, NIS2) | Manuell |
| `knowledge` | Allgemeine Recherche-Ergebnisse | Nach jeder Session / Inbox |
| `linkedin_style` | LinkedIn Posts als Stil-Referenz | Nach jedem bestätigten Post |
| `sessions` | Claude Code Session-Summaries | Automatisch |
| `session_learnings` | Extrahierte Learnings pro Projekt | Nach `learn` Command |
| `decisions` | Architektur-Entscheidungen mit Dependencies | Nach `decisions index` oder `learn` |
| `research_findings` | Overnight Research Ergebnisse | Automatisch (Daemon) |

## Safety — Non-Negotiable

- **Safety Gates auf ORIGINAL User-Input UND enriched Prompt** — doppelte Prüfung (DEC-006: LLM kann destructive Intent "reinigen")
- **gates.py** validiert: `[BLOCK]` verhindert Ausführung (rm -rf /, drop database, force push main), `[WARN]` ist advisory
- --cwd, --model, --max-turns werden von Python garantiert (nicht vom LLM)
- **Permission Model** (session.py): `skip` = autonomous, `default` = User approves, `plan` = read-only
- **Guardian Monitor:** Prüft Claude's Vorschläge gegen Decisions WÄHREND der Ausführung
- **Orphan Recovery:** Verwaiste RUNNING Tasks werden beim Daemon-Start als FAILED markiert
- Plan-Phase (read-only) vor Execution bei Feature/Refactor auf bestehenden Projekten
- **Briefing Memory**: `mark_briefing_shown()` trackt letztes Briefing

## Decisions (DEC-001 bis DEC-007)

| ID | Titel | Kern |
|---|---|---|
| DEC-001 | Safety consolidated into gates.py | Kein safety.py — alles in gates.py |
| DEC-002 | Permission model from SkillMeta | skip/default/plan aus Config, nicht hardcoded |
| DEC-003 | Learning loop needs LLM + embeddings | Ohne beides vergisst geofrey alles |
| DEC-004 | Claude Code chunks are legacy | 77 Chunks nicht im Enrichment-Flow (nur hub-query) |
| DEC-005 | Intent layer requires LLM | Keyword-Router ist Fallback, nicht Primary |
| DEC-006 | Guardian of project vision | Claude's Vorschläge gegen Decisions prüfen |
| DEC-007 | Guardian timing gap accepted | Prompt-Injection ist 1. Verteidigung, Monitor 2. |

## Code-Stil

- Python: Standard Library wo möglich, minimale Dependencies
- Keine Klassen wo Funktionen reichen
- Type Hints auf Funktionssignaturen
- Docstrings auf jede Funktion und jedes Modul
- f-strings, Path-Objekte
- Kein LangChain, keine unnötigen Abstraktionen
- Kein Web UI in Phase 1 — Terminal + native macOS App

## Qwen3.5 Thinking-Modus

WICHTIG: Qwen3.5 hat einen Extended Thinking Modus der standardmäßig aktiv ist. Bei direkten Ollama-Calls IMMER `think=False` und `temperature=0.3` setzen:

```python
ollama.chat(model="qwen3.5:9b", messages=msgs, think=False, options={"temperature": 0.3})
```

## Entwicklungsregeln

1. Immer gegen den Plan prüfen (docs/vision.md)
2. Knowledge Base Markdown-Dateien sind Source of Truth, ChromaDB ist wegwerfbar
3. Safety first — keine Ausnahmen
4. Keep it simple — keine Frameworks die nicht nötig sind
5. Project Journal pflegen (docs/project-journal.md)
6. Testen vor Commit
7. VOR dem Entfernen einer Komponente: Systemische Konsequenzen durchdenken (DEC-003, DEC-005)
8. Decisions dokumentieren für alle architektonischen Entscheidungen
