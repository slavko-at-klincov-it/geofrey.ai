# geofrey — Autonomer Personal Agent

## Was geofrey ist

geofrey ist Slavkos autonomer Personal Agent — ein zweites Ich das nie schläft. geofrey kennt den User, seinen DACH-Markt, seine Projekte, seinen Schreibstil, und reichert jeden Input automatisch mit dem richtigen Kontext an. Ein System das den Kontext kennt, kann besser prompten als der User selbst.

**Beweis:** 17 Zeichen User-Input → 14.436 Zeichen angereicherter Prompt. Deterministisch, ohne LLM.

geofrey ist KEIN CLI-Wrapper und KEIN Chatbot. geofrey ist ein autonomer Agent der:
1. Jeden User-Input automatisch mit Projekt-Kontext, Architektur, Learnings und Regeln anreichert (Prompt Enrichment)
2. Claude Code Sessions autonom startet, überwacht und Learnings extrahiert (Session Automation)
3. Tasks über Nacht abarbeitet und ein Morning Briefing bereitstellt (Overnight Agent)
4. Mit jedem Gespräch dazulernt — Wissen bleibt persistent

## Architektur — Drei Säulen

```
User Input → Prompt Enrichment Engine → Session Manager → Claude Code CLI
                     ↓                         ↓
              Knowledge Layer            Overnight Daemon
              (ChromaDB, Learnings)      (Task Queue, Agents)
                                               ↓
                                         Morning Briefing
```

### Säule 1: Prompt Enrichment (deterministisch, kein LLM)
```
User Input (17 chars)
  → Python: detect_task_type()        # Keyword-Matching (router.py)
  → Python: get_skill_meta()          # Config-basierte Defaults (router.py)
  → Python: gather_project_context()  # Git, Docs, ChromaDB (context_gatherer.py)
  → Python: load_enrichment_rules()   # YAML-Regeln (enricher.py, brain/rules/)
  → Python: _build_enriched_prompt()  # Alles zusammenbauen (enricher.py)
  → Result: EnrichedPrompt (14.436 chars)
```

### Säule 2: Session Automation (tmux + Claude Code)
```
EnrichedPrompt
  → tmux new-session (session.py)
  → claude --dangerously-skip-permissions -p "..." --model opus --cwd /path
  → Monitoring via tmux has-session
  → capture-pane nach Abschluss
  → Session Intelligence → Learnings extrahieren
```

### Säule 3: Overnight Agent (launchd Daemon, 02:00)
```
Task Queue (SQLite) → Daemon → Agents → Morning Briefing
```

**Model-Policy** (config/config.yaml):
- Code-Tasks (code-fix, feature, refactor): **Opus**
- Analysis-Tasks (review, research, security): **Opus**
- Content-Tasks (doc-sync, LinkedIn): **Sonnet**

## Vorgänger-Projekte (jetzt Teil von geofrey)

| Altes Projekt | Was es war | Was davon in geofrey kommt |
|---|---|---|
| CLI_Maestro | Claude Code Orchestrator | Orchestrator-Logik, 82 Knowledge Chunks, Safety-System, Prompt-Architektur |
| knowledge-assistant | RAG-System mit Chat | Knowledge Hub, Multi-Collection ChromaDB, DACH-Kontext, Ingestion Pipeline |
| LinkedIn_Automat | Post-Daten Pipeline | 38+ geparste Posts, Style Guide, Post-Generierung |

## Tech Stack

- **Sprache:** Python 3.12+ (Backend), Swift/SwiftUI (native macOS UI)
- **LLM:** Qwen3.5-9B via Ollama (Minimum viable, kein kleineres)
- **Embeddings:** nomic-embed-text via Ollama
- **Vector Store:** ChromaDB (persistent unter ~/.knowledge/vectordb/)
- **Externe KI:** Claude Code (via CLI), Gemini (Bildgenerierung)
- **Hardware:** MacBook Pro M3 Pro, 18GB RAM
- **Kein LangChain** — direkte Ollama + ChromaDB Calls

## Projektstruktur

```
geofrey/
├── brain/                    # Agent-Logik (Drei Säulen)
│   ├── models.py             # Shared Dataclasses: Task, Session, EnrichedPrompt, BriefingItem, EnrichmentRule
│   ├── enricher.py           # Prompt Enrichment Engine: Regeln laden, Kontext sammeln, Prompt bauen
│   ├── context_gatherer.py   # Kontext sammeln: Git, CLAUDE.md, ChromaDB, Diff Scope
│   ├── session.py            # Session Manager: tmux starten/überwachen/capturen
│   ├── queue.py              # Task Queue: SQLite-Backend, CRUD, Priority-Ordering
│   ├── daemon.py             # Overnight Daemon: Queue abarbeiten, Briefing generieren, launchd
│   ├── briefing.py           # Morning Briefing: Tasks kategorisieren, Terminal + JSON/MD Export
│   ├── agents/               # Agent-System
│   │   └── base.py           # BaseAgent + Factory-Dispatcher (run_agent)
│   ├── rules/                # Enrichment Rules als YAML (7 Task-Typen)
│   │   ├── code-fix.yaml
│   │   ├── feature.yaml
│   │   ├── refactor.yaml
│   │   ├── review.yaml
│   │   ├── research.yaml
│   │   ├── security.yaml
│   │   └── doc-sync.yaml
│   ├── orchestrator.py       # Legacy Orchestrator: chat(), single_task()
│   ├── command.py            # CommandSpec + build_command() — deterministischer Command-Bau
│   ├── router.py             # Task-Type Detection + SkillMeta (7 Skills, DE+EN Keywords)
│   ├── gates.py              # validate_prompt() — Secrets/Dangerous Pattern Check
│   ├── scope.py              # Diff Scope Detection (git-Änderungen kategorisieren)
│   ├── prompts.py            # Template-Loader (load_template, render_template)
│   ├── safety.py             # Safety-Chunks, RAG-Injection
│   ├── linkedin.py           # LinkedIn Post Pipeline
│   ├── templates/            # LLM-System-Prompts als Markdown
│   └── skills/               # Skill-Templates: leiten LLM beim Prompt-Schreiben an
├── knowledge/                # Knowledge Hub
│   ├── hub.py                # Zentrale API (kein LangChain)
│   ├── store.py              # ChromaDB Wrapper (multi-collection)
│   ├── ingest.py             # Document Loading + Chunking + Embedding
│   ├── context.py            # DACH Personal Context Manager
│   ├── linkedin.py           # LinkedIn Post Ingestion + Style Guide
│   ├── sessions.py           # Claude Code Session Pipeline + Inbox
│   └── intelligence.py       # Session Intelligence — Learnings aus Sessions extrahieren
├── knowledge-base/           # RAG Knowledge Chunks (Markdown, Source of Truth)
│   ├── claude-code/          # 110 Chunks über Claude Code
│   ├── context/              # DACH-Kontext Dateien (Profil, DSGVO, NIS2, etc.)
│   └── sessions/             # Extrahierte Session-Learnings pro Projekt
├── ui/                       # Native macOS App (SwiftUI) — Phase 2
├── config/
│   ├── config.yaml           # Modelle, Pfade, Chunk-Settings, Skill-Defaults
│   └── projects.yaml         # Projekt-Registry
├── scripts/                  # Utility-Scripts
│   ├── embed.py              # Knowledge Base embedden
│   ├── query.py              # Debug-Tool für Retrieval
│   └── update.py             # Daily Knowledge Update (Cron)
├── data/
│   └── linkedin/             # LinkedIn Posts (all_posts.md + neue)
├── docs/
│   ├── architecture.md       # Technische Architektur (Drei Säulen)
│   ├── project-journal.md    # Entwicklungs-Log
│   └── vision.md             # Produkt-Vision und Roadmap
├── main.py                   # CLI Entry Point (20 Commands)
├── requirements.txt
└── CLAUDE.md                 # Diese Datei
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
geofrey queue list [--status done]        # Tasks anzeigen
geofrey queue process                     # Pending Tasks abarbeiten

# Overnight + Briefing
geofrey overnight                         # Voller Overnight-Zyklus (Queue + Briefing)
geofrey briefing                          # Morning Briefing anzeigen
geofrey install-daemon                    # launchd Plist generieren

# Knowledge
geofrey learn                             # Session Learnings extrahieren
geofrey learnings [project] [--query]     # Learnings anzeigen/suchen
geofrey status                            # Collections + Chunks
geofrey skills                            # Verfügbare Skills
```

## ChromaDB Collections

Alle in `~/.knowledge/vectordb/` (shared):

| Collection | Inhalt | Update-Frequenz |
|---|---|---|
| `claude_code` | 110 Chunks Claude Code Expertenwissen | Täglich (Cron 03:00) |
| `context_personal` | DACH-Kontext (Profil, DSGVO, NIS2, EU Data Boundary) | Manuell |
| `knowledge` | Allgemeine Recherche-Ergebnisse | Nach jeder Session / Inbox |
| `linkedin_style` | LinkedIn Posts als Stil-Referenz | Nach jedem bestätigten Post |
| `sessions` | Claude Code Session-Summaries | Automatisch |
| `session_learnings` | Extrahierte Learnings pro Projekt (Decisions, Bugs, Discoveries, etc.) | Nach `learn` Command |

## Safety — Non-Negotiable

- Safety-Chunks werden IMMER via RAG in den LLM-Kontext injiziert
- validate_prompt() prüft auf Secrets und Dangerous Patterns
- --cwd, --model, --max-budget-usd werden von Python garantiert (nicht vom LLM)
- User-Bestätigung vor Ausführung (interaktiv) oder Agent-Autonomie mit Budget-Limit (overnight)
- Overnight Sessions nur in tmux (isoliert), mit Budget-Limit
- Plan-Phase (read-only) vor Execution bei Feature/Refactor auf bestehenden Projekten

## Code-Stil

- Python: Standard Library wo möglich, minimale Dependencies
- Keine Klassen wo Funktionen reichen
- Type Hints auf Funktionssignaturen
- Docstrings auf jede Funktion und jedes Modul
- f-strings, Path-Objekte
- Kein LangChain, keine unnötigen Abstraktionen
- Kein Web UI in Phase 1 — Terminal + native macOS App

## Qwen3.5 Thinking-Modus

WICHTIG: Qwen3.5 hat einen Extended Thinking Modus der standardmäßig aktiv ist. Bei direkten Ollama-Calls IMMER `think=False` setzen, sonst hängt der Call minutenlang:

```python
ollama.chat(model="qwen3.5:9b", messages=msgs, think=False)
```

## Entwicklungsregeln

1. Immer gegen den Plan prüfen (docs/vision.md)
2. Knowledge Base Markdown-Dateien sind Source of Truth, ChromaDB ist wegwerfbar
3. Safety first — keine Ausnahmen
4. Keep it simple — keine Frameworks die nicht nötig sind
5. Project Journal pflegen (docs/project-journal.md)
6. Testen vor Commit
