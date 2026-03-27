# geofrey — Autonomous Personal Agent

> A system that knows the context can prompt better than the user.

**Proof:** 17 characters of user input → 14,436 characters of enriched prompt. Deterministic, no LLM.

geofrey is an autonomous personal agent that runs locally on macOS. It is not a CLI wrapper or chatbot. geofrey knows the user, their projects, their DACH market context, and enriches every input with the right context automatically.

## Three Pillars

```
User Input → Prompt Enrichment Engine → Session Manager → Claude Code CLI
                     ↓                         ↓
              Knowledge Layer            Overnight Daemon
              (ChromaDB, Learnings)      (Task Queue, Agents)
                                               ↓
                                         Morning Briefing
```

### 1. Prompt Enrichment (deterministic, no LLM)

User types `"fix the login bug"` — geofrey builds a structured prompt with git state, architecture docs, session learnings, DACH regulatory context, and task-specific rules. All Python, no LLM call.

### 2. Session Automation (tmux + Claude Code)

Claude Code sessions are started in tmux, monitored, output captured, and learnings extracted via a Map-Reduce pipeline (Qwen3.5 via Ollama).

### 3. Overnight Agent (launchd daemon)

Tasks are queued during the day. At 02:00, the daemon processes them autonomously and generates a morning briefing.

## Decision Dependency System

geofrey includes a **Decision Dependency System** — a novel approach to preventing AI coding assistants from reverting intentional architectural decisions.

### The Problem

AI coding assistants work reactively: they read current code but don't know *why* it looks the way it does. This leads to loops where Claude undoes deliberate decisions from previous sessions.

**Example:** Session A consolidates `safety.py` into `gates.py` (intentional architecture decision). Session B sees no `safety.py` and recreates it — undoing Session A's work.

### The Solution

geofrey sits *before* the LLM and injects decision context into every prompt:

1. **Decision Log** — Markdown files with YAML frontmatter (`knowledge-base/decisions/`)
2. **Three-Level Conflict Detection** — scope overlap, keyword matching, semantic search (ChromaDB)
3. **Dependency Chain Traversal** — follows `depends_on`/`enables` relationships transitively
4. **Automatic Extraction** — Session Intelligence extracts structured decisions from completed sessions
5. **Deterministic Injection** — relevant decisions are injected into the enriched prompt, not suggested via CLAUDE.md

```
User Input: "fix the safety system"
  → Enricher detects scope overlap with brain/gates.py
  → Finds DEC-001: "Safety consolidated into gates.py"
  → Injects warning: "Do NOT recreate safety.py — consolidated by design"
  → Claude receives context BEFORE reasoning
```

### Why This Matters

No existing tool combines Decision Dependencies + Prompt Enrichment + Conflict Detection. ADRs are not machine-readable. CLAUDE.md has ~60-75% compliance. Existing memory tools (Zep, ConPort) don't model relationships between decisions.

For the full research paper including academic references, state of the art analysis, and architecture design, see [docs/decision-dependency-system.md](docs/decision-dependency-system.md).

## Quick Start

```bash
# Prerequisites: Python 3.12+, Ollama with qwen3.5:9b + nomic-embed-text
pip install -r requirements.txt

# Interactive mode
python main.py chat

# Single task with full enrichment
python main.py task "fix login in meus"

# Task queue for overnight processing
python main.py queue add "refactor auth" --project meus --priority high
python main.py overnight

# Morning briefing
python main.py briefing
```

## CLI Commands

```bash
# Interactive
geofrey chat                              # Orchestrator mode
geofrey task "fix login bug"              # Single task with enrichment

# LinkedIn
geofrey post "NIS2 for SMEs"             # Post generation pipeline

# Task Queue
geofrey queue add "refactor auth" --project meus --priority high
geofrey queue list [--status done]
geofrey queue process

# Overnight + Briefing
geofrey overnight                         # Full overnight cycle
geofrey briefing                          # Show morning briefing
geofrey install-daemon                    # Generate launchd plist

# Knowledge
geofrey learn                             # Extract learnings from sessions
geofrey learnings [project] [--query]     # View/search learnings
geofrey status                            # Show collections + chunks

# Decisions
geofrey decisions list [--project X]      # Show active decisions
geofrey decisions check "task" --project X  # Conflict check
geofrey decisions index --project X       # Re-index in ChromaDB
```

## Tech Stack

- **Language:** Python 3.12+
- **Local LLM:** Qwen3.5-9B via Ollama (extraction, consolidation)
- **Embeddings:** nomic-embed-text via Ollama
- **Vector Store:** ChromaDB (persistent, multi-collection)
- **External AI:** Claude Code (via CLI — users bring their own subscription)
- **No LangChain** — direct Ollama + ChromaDB calls

## Project Structure

```
geofrey/
├── brain/                    # Agent logic (Three Pillars)
│   ├── models.py             # Dataclasses: Task, Session, EnrichedPrompt, Decision, ...
│   ├── enricher.py           # Prompt Enrichment Engine
│   ├── context_gatherer.py   # Context gathering: Git, Docs, ChromaDB, Decisions
│   ├── decision_checker.py   # Decision conflict detection (3-level matching)
│   ├── session.py            # Session Manager (tmux)
│   ├── queue.py              # Task Queue (SQLite)
│   ├── daemon.py             # Overnight Daemon
│   ├── briefing.py           # Morning Briefing
│   ├── orchestrator.py       # Interactive + single task orchestration
│   ├── router.py             # Task-type detection (DE+EN keywords)
│   ├── gates.py              # Prompt validation ([BLOCK] + [WARN])
│   ├── rules/                # Enrichment rules per task type (YAML)
│   └── templates/            # LLM prompt templates
├── knowledge/                # Knowledge layer
│   ├── store.py              # ChromaDB wrapper
│   ├── decisions.py          # Decision storage + retrieval + dependency walker
│   ├── intelligence.py       # Session Intelligence (Map-Reduce extraction)
│   └── ...                   # Ingestion, context, LinkedIn
├── knowledge-base/           # Source of Truth (Markdown)
│   ├── decisions/            # Decision log per project
│   ├── sessions/             # Extracted session learnings
│   ├── claude-code/          # Claude Code knowledge chunks
│   └── context/              # DACH context files
├── config/
│   ├── config.yaml           # Models, paths, skill defaults
│   └── projects.yaml         # Project registry
├── tests/                    # Unit + integration tests
├── main.py                   # CLI entry point
└── CLAUDE.md                 # Project instructions for AI assistants
```

## Documentation

| Document | Content |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Project instructions, architecture overview, development rules |
| [docs/architecture.md](docs/architecture.md) | Detailed technical architecture |
| [docs/decision-dependency-system.md](docs/decision-dependency-system.md) | Research paper: the Decision Dependency problem + solution |
| [docs/vision.md](docs/vision.md) | Product vision and roadmap |

## Safety

- `gates.py` validates all prompts: `[BLOCK]` prevents execution (rm -rf, drop database, force push), `[WARN]` is advisory
- `--cwd`, `--model`, `--max-budget-usd` are Python-guaranteed (not LLM-dependent)
- Permission model: `skip` (autonomous), `default` (user approves), `plan` (read-only)
- Overnight sessions run in isolated tmux with budget limits
- Decision system prevents unintentional reverts of architectural choices

## License

Private project. Not open source.
