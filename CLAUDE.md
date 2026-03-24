# geofrey — Personal AI Assistant

## Was geofrey ist

geofrey ist Slavkos persönlicher AI-Assistent. Ein lokales LLM (Qwen3.5-9B via Ollama) das als intelligente Zwischenschicht zwischen dem User und Claude Code fungiert. geofrey kennt den User, seinen DACH-Markt, seine Projekte, seinen Schreibstil und weiß genau wie man Claude Code richtig verwendet.

geofrey ist KEIN General-Purpose Chatbot. geofrey ist ein Orchestrator der:
1. Versteht was der User will
2. Den richtigen Claude Code Befehl generiert (Modell, Flags, Kontext, Scope)
3. Ergebnisse in die zentrale Wissensbasis speichert
4. Mit jedem Gespräch dazulernt

## Architektur

```
User → geofrey UI (native macOS) → geofrey Brain (Qwen3.5-9B)
                                        ↓
                                   Knowledge Hub (ChromaDB)
                                        ↓
                                   Claude Code (Recherche, Code, Prompts)
                                        ↓
                                   Gemini (Bildgenerierung)
```

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
├── brain/              # Orchestrator-Logik (ex CLI_Maestro)
│   ├── orchestrator.py # Hauptlogik: User-Input → Claude Code Command
│   ├── prompts.py      # System-Prompts, Prompt-Templates
│   └── safety.py       # Safety-Chunks, Validierung
├── knowledge/          # Knowledge Hub (ex knowledge-assistant)
│   ├── hub.py          # Zentrale API (kein LangChain)
│   ├── store.py        # ChromaDB Wrapper (multi-collection)
│   ├── ingest.py       # Document Loading + Chunking + Embedding
│   ├── context.py      # DACH Personal Context Manager
│   ├── linkedin.py     # LinkedIn Post Ingestion + Style Guide
│   └── sessions.py     # Claude Code Session Pipeline + Inbox
├── knowledge-base/     # RAG Knowledge Chunks (Markdown, Source of Truth)
│   ├── claude-code/    # 82 Chunks über Claude Code (ex CLI_Maestro/knowledge/)
│   └── context/        # DACH-Kontext Dateien (Profil, DSGVO, NIS2, etc.)
├── ui/                 # Native macOS App (SwiftUI) — Phase 2
├── config/
│   ├── config.yaml     # Modelle, Pfade, Chunk-Settings
│   └── projects.yaml   # Projekt-Registry
├── scripts/            # Utility-Scripts
│   ├── embed.py        # Knowledge Base embedden
│   ├── query.py        # Debug-Tool für Retrieval
│   └── update.py       # Daily Knowledge Update (Cron)
├── data/
│   └── linkedin/       # LinkedIn Posts (all_posts.md + neue)
├── docs/
│   ├── project-journal.md  # Entwicklungs-Log
│   ├── architecture.md     # Technische Architektur
│   └── vision.md           # Produkt-Vision und Roadmap
├── main.py             # CLI Entry Point
├── requirements.txt
└── CLAUDE.md           # Diese Datei
```

## ChromaDB Collections

Alle in `~/.knowledge/vectordb/` (shared):

| Collection | Inhalt | Update-Frequenz |
|---|---|---|
| `claude_code` | 82 Chunks Claude Code Expertenwissen | Täglich (Cron 03:00) |
| `context_personal` | DACH-Kontext (Profil, DSGVO, NIS2, EU Data Boundary) | Manuell |
| `knowledge` | Allgemeine Recherche-Ergebnisse | Nach jeder Session / Inbox |
| `linkedin_style` | LinkedIn Posts als Stil-Referenz | Nach jedem bestätigten Post |
| `sessions` | Claude Code Session-Summaries | Automatisch |

## Safety — Non-Negotiable

- Safety-Chunks werden IMMER in jeden Prompt injiziert
- Keine Secrets in Claude Code Prompts
- Immer --cwd Scope auf das richtige Projekt
- Budget-Limits immer setzen (--max-budget-usd)
- User-Bestätigung vor Ausführung gefährlicher Commands

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
