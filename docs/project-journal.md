# geofrey — Project Journal

## Ursprung

geofrey ist die Zusammenführung mehrerer isolierter AI-Projekte zu einem einzigen Personal AI Assistant. Der Name "geofrey" existierte bereits als Domain (geofrey.ai) und wurde in LinkedIn-Posts erwähnt.

---

## 2026-03-22 — CLI_Maestro Projektstart (Vorgänger)

**Kontext:** Slavko nutzt Claude Code CLI, kennt aber nicht alle Features. Er wollte ein lokales LLM das Claude Code in- und auswendig kennt und als Orchestrator fungiert.

**Was gebaut wurde:**
- 82 Knowledge Chunks in 17 Kategorien (alle Claude Code Features)
- Python Orchestrator (maestro.py) mit RAG Pipeline
- Embedding Pipeline (embed_chunks.py) für ChromaDB
- Daily Update Pipeline (update_knowledge.py + Cron)
- Debug Tool (query_knowledge.py)
- Projekt-Registry (projects.yaml)

**Kernentscheidungen:**
- RAG statt Fine-Tuning (Claude Code wird ständig aktualisiert)
- Kein LangChain (direkte Ollama + ChromaDB Calls)
- Markdown als Source of Truth (ChromaDB wegwerfbar)
- Safety-Chunks immer injiziert

---

## 2026-03-23 — Erster Maestro E2E Test

**Was gemacht:**
- Qwen3.5:4b getestet → zu klein, vergisst Orchestrator-Rolle
- Qwen3.5:9b getestet → funktioniert, Minimum viable
- Prompt-Architektur gefixt: RAG-Kontext als separater Conversation Turn statt im System-Prompt
- Embedding Truncation (MAX_EMBED_CHARS=6000)

**Key Learning:** Bei kleinen Modellen (< 14B) muss der System-Prompt kurz bleiben. Kontext gehört in separate Conversation Turns.

---

## 2026-03-24 — Knowledge Hub + geofrey Zusammenführung

### Session-Übersicht

Umfangreiche Session in der mehrere Dinge passiert sind:

### 1. Bestandsaufnahme aller AI-Projekte

| Projekt | Status | Funktion |
|---|---|---|
| CLI_Maestro | Funktional | Claude Code Orchestrator (82 Chunks, RAG) |
| knowledge-assistant | Funktional | RAG-System mit Chat (ChromaDB, Qwen3.5-2B) |
| ANE-PersonalAI | Funktional | Continuous Learning auf Apple Neural Engine |
| LinkedIn_Automat | Nur Datenpipeline | 38 Posts geparst, kein Training |
| LAEI | Funktional | Monitoring aller lokalen AI-Runtimes |
| TranscriptLLM | Funktional | Meeting-Transkription + Zusammenfassung |

**Erkenntnis:** Alle Projekte arbeiteten isoliert. Recherche ging verloren, lokale KI hatte keinen DACH-Kontext, LinkedIn war eine Sackgasse.

### 2. Knowledge Hub gebaut

knowledge-assistant wurde zum zentralen Hub ausgebaut:
- **store.py:** `collection_name` Parameter für Multi-Collection Support
- **hub.py:** Neue LangChain-freie API für externe Projekte
- **context.py:** Personal Context Manager (DACH)
- **linkedin.py:** LinkedIn Post Parser + Style Guide
- **session_ingest.py:** Claude Code Session Pipeline + Inbox

5 DACH-Kontext Dateien erstellt:
- profile.md (Slavko, EPU, DACH-Markt)
- dsgvo.md (DSGVO/GDPR Kernpunkte)
- nis2.md (NIS2 in AT/DE)
- eu_data_boundary.md (Microsoft EU Data Boundary)
- dach_market.md (AT/DE/CH Geschäftskontext)

### 3. Maestro Migration

CLI_Maestro auf shared ChromaDB umgestellt:
- CHROMA_DIR → ~/.knowledge/vectordb/
- COLLECTION_NAME → "maestro"
- context_personal Retrieval in retrieve_context() eingebaut
- Nur Profil (nicht alle 5 DACH-Dateien) um Context für 9B Modell klein zu halten

### 4. Tests + Fixes

| Problem | Fix |
|---|---|
| RAG Chat Timeout (Qwen3.5 Thinking-Modus) | ChatOllama durch direkte ollama.chat(think=False) ersetzt |
| LinkedIn Wortanzahl falsch (Ø 16 statt 197) | Regex $ → \Z für DOTALL-Modus |
| LinkedIn Themen verrauscht | Filter für echte Topic-Labels (keine Sätze, Emojis) |
| Status Total falsch (4 statt 231) | sum(collections.values()) statt self.count() |
| Maestro Context zu groß (25KB) | Nur profile.md statt alle 5 Context-Dateien |

### 5. Entscheidung: Training vs. RAG für LinkedIn

**Diskussion:** Sollen wir ein eigenes Modell auf Slavkos Posts trainieren?

**Entscheidung: RAG (kein Training)**
- 38 Posts zu wenig für Fine-Tuning (auch bei 100-500: RAG bleibt besser)
- Stil entwickelt sich weiter — RAG kann neueste Posts höher gewichten
- Sofort aktualisierbar (kein Retraining)
- Fakten-Genauigkeit: trainierte Modelle halluzinieren in deinem Stil
- Few-Shot Prompting (3-5 ähnliche Posts + Style Guide) liefert bessere Ergebnisse

### 6. geofrey Zusammenführung

**Entscheidung:** CLI_Maestro, knowledge-assistant, LinkedIn_Automat werden zu einem Projekt zusammengeführt: **geofrey**.

- Altes geofrey Repo geleert (war "freight visibility platform")
- GitHub force-pushed als Clean Slate
- CLAUDE.md, vision.md, project-journal.md erstellt
- Projektstruktur definiert

### 7. geofrey Workflow definiert

```
User → geofrey UI (native macOS)
  → geofrey Brain (Qwen3.5-9B + Knowledge Hub)
    → Claude Code (Recherche, Code, Bild-Prompts)
      → Gemini (Bildgenerierung)
    → Ergebnis zurück in Knowledge Hub (stetig lernend)
```

**LinkedIn-Flow:**
1. User gibt Thema
2. geofrey holt Style Guide + ähnliche Posts + DACH-Kontext
3. geofrey generiert Post-Entwurf
4. geofrey öffnet Claude Code (Sonnet) für 4 Bild-Prompt Vorschläge
5. User sieht Post + 4 Bild-Optionen im UI
6. User bestätigt → Post wird gespeichert, Bild-Prompt geht an Gemini

**Bild-Stil-Vorlieben:**
- Keine realen Fotos
- Sketches, Zeichnungen, Illustrationen
- Personen die etwas zeigen/erklären
- Whiteboards mit Diagrammen

---

### 8. Code-Migration nach geofrey (gleiche Session)

Alles von CLI_Maestro + knowledge-assistant in ein sauberes geofrey Repo migriert:

**Struktur:**
```
geofrey/
├── brain/              # orchestrator.py, prompts.py, safety.py, linkedin.py
├── knowledge/          # hub.py, store.py, ingest.py, context.py, linkedin.py, sessions.py
├── knowledge-base/     # 82 Claude Code Chunks + 5 DACH Context Dateien
├── data/linkedin/      # 38 LinkedIn Posts (all_posts.md)
├── config/             # config.yaml, projects.yaml
├── scripts/embed.py    # Embedding Pipeline
├── docs/               # vision.md, project-journal.md
├── main.py             # 12 CLI Commands
└── CLAUDE.md
```

**Wichtige Änderungen gegenüber Vorgängern:**
- Kein LangChain mehr — alles direkte Ollama + ChromaDB Calls
- `think=False` bei allen Qwen3.5 Calls (verhindert Thinking-Mode Timeout)
- Collection `claude_code` statt `maestro` (82 Chunks)
- Nur Profil-Context für Orchestrator (nicht alle 5 DACH-Dateien)
- 313 Chunks in 6 Collections, alles getestet

### 9. LinkedIn Post-Generierung Pipeline

**Neuer Command:** `python main.py post "NIS2 für KMU"`

**Flow:**
1. geofrey holt Style Guide + 3 ähnliche Posts + DACH-Kontext
2. Qwen3.5-9B generiert Post-Entwurf (~230 Wörter, ~38s)
3. Interaktiver Loop: nehmen / neu / bearbeiten / bild / abbrechen
4. Bei "bild": Claude Code (Sonnet) generiert 4 Bild-Prompt Vorschläge
5. Bei "nehmen": Post wird in ChromaDB gespeichert + an all_posts.md angehängt

**Bild-Prompt Ergebnisse (getestet):**
- 4 Optionen, alle im richtigen Stil (Sketches, Whiteboards, Illustrationen)
- Claude Code Sonnet generiert in ~5-10s
- Stil-Regeln: keine realen Fotos, Personen die etwas erklären, Whiteboards, fiktive Szenen

**Entscheidung: Training vs. RAG für LinkedIn**
- Diskutiert ob ein eigenes Modell auf Posts trainiert werden soll (auch mit 100-500 Posts)
- Entscheidung: RAG mit Few-Shot Prompting ist besser weil:
  - Stil entwickelt sich, trainiertes Modell mittelt alles
  - RAG kann ähnlichste Posts gezielt als Beispiel holen
  - Sofort aktualisierbar, kein Retraining
  - Keine Fakten-Halluzination in deinem Stil

### 10. Gemini-Anbindung (verschoben)

- Diskutiert: Gemini API (google-genai SDK) vs. Vertex AI Imagen
- Entscheidung: Später. Manuelles Kopieren der Bild-Prompts reicht vorerst
- Wenn implementiert: API Key von Google AI Studio (gratis Tier), Bild lokal speichern

---

## 2026-03-24 — Session Intelligence Feature

**Problem:** Claude Code generiert beim Arbeiten wertvolles Wissen (Debugging-Findings, Architektur-Entscheidungen, Root Causes, Dinge die nicht funktioniert haben). Dieses Wissen verschwindet nach der Session. Niemand schreibt es auf.

**Lösung:** Session Intelligence Pipeline — extrahiert automatisch Learnings aus Claude Code Session-JSONLs via Map-Reduce mit Qwen3.5-9B.

**Was gebaut wurde:**

1. `knowledge/intelligence.py` (~300 Zeilen) — Kern-Pipeline
   - Parst Session-JSONL-Dateien (`~/.claude/projects/<slug>/<session>.jsonl`)
   - Extrahiert nur user text + assistant text-Blöcke, filtert Noise
   - Chunked in ~2500-char Segmente für 9B-Modell Kontext
   - Map-Phase: Jeder Chunk → Qwen3.5-9B → JSON mit 6 Kategorien
   - Multi-Pass Reduce: Batches à 5 → konsolidiert → wiederholt bis alles passt
   - Speichert als Markdown (Source of Truth) + ChromaDB Index

2. `brain/prompts.py` — 2 neue Prompt-Templates (Extract + Consolidate)

3. `knowledge/sessions.py` — 2 neue Helpers (Slug-Konvertierung, Session-Discovery)

4. `main.py` — 2 neue Commands: `learn` + `learnings`

**Lernkategorien:**
- Decisions (Architektur-/Design-Entscheidungen mit Begründung)
- Bugs Found (Root Cause + Fix)
- Discoveries (Wichtige Findings über Codebase/Tools)
- Negative Knowledge (Was NICHT funktioniert hat und warum)
- Configuration (Setup-/Config-Learnings)
- Patterns (Wiederverwendbare Muster)

**Test-Ergebnisse:**
- Kleine Session (13 turns, 2 chunks): 12 Items in ~30s
- Große Session (153 turns, 36 chunks): 169 Items nach 3-Pass Consolidation (von 586 → 169)
- Ohne Multi-Pass: 586 unkondensierte Items (zu viel, Duplikate)
- Mit Multi-Pass (35 → 7 → 2 → 1): Saubere, deduplizierte Ergebnisse

**Kernentscheidungen:**
- Map-Reduce statt ein großer LLM-Call (9B hat nur ~8K Kontext)
- Multi-Pass Consolidation für große Sessions (>5 Chunks)
- JSON-Output vom LLM (zuverlässiger parsbar als Freitext bei 9B)
- Session-JSONLs als Datenquelle (nicht history.jsonl — dort fehlen Assistant-Antworten)
- Pro Kategorie ein eigener ChromaDB-Chunk (bessere Retrieval-Präzision)
- Markdown als Source of Truth unter `knowledge-base/sessions/{project}/`

**Neue CLI Commands:**
```bash
python main.py learn                        # Alle unprocessed Sessions
python main.py learn --project geofrey      # Nur ein Projekt
python main.py learn --session 691d7f6f     # Spezifische Session
python main.py learnings                    # Übersicht aller Projekte
python main.py learnings geofrey            # Projekt-Details
python main.py learnings --query "bug"      # RAG-Suche
```

---

## 2026-03-24 — Knowledge Base Erweiterung (System Prompts)

**Quelle:** GitHub Repo `asgeirtj/system_prompts_leaks` — enthält geleakte System-Prompts von Claude Code, Cowork, claude.ai.

**Was analysiert wurde:**
- `claude-code.md` (v2.1.50, 78KB) — Claude Code System-Prompt
- `claude-code2.md` (v2.1.72, 1.2MB) — Aus 643 npm-Bundle-Fragmenten assembliert
- `claude-cowork.md` (151KB) — Cowork-Modus System-Prompt

**15 neue Knowledge Chunks erstellt (82 → 97):**

| Neue Kategorie | Chunks | Inhalt |
|---|---|---|
| `system-prompt/` (neu) | 7 | Prompt-Struktur, Tool-Schemas, Security Monitor, Verification System, Auto Memory, Git Safety Protocol, Classifier-Reminders |
| `safety/` (erweitert) | 2 | Injection Defense Architektur, Reversibility Framework |
| `cowork/` (neu) | 2 | Architektur (VM, File-Mounting, Skills), Tools (MCP, Plugins, Preview) |
| `agents/` (erweitert) | 2 | Detaillierte Subagent-Specs mit Tool-Access, Worktree-Isolation |
| `mcp/` (erweitert) | 1 | Registry, Plugins, ToolSearch/Deferred Loading |
| `cli/` (erweitert) | 1 | Plan-Mode Internals (7 Kriterien, 5-Phasen-Workflow) |

**Besonders wertvoll für geofrey:**
- Exakte Tool-Schemas → geofrey kann präzisere Claude Code Commands generieren
- Security Monitor Regeln → geofrey kann Safety-Checks verbessern
- Plan-Mode Entscheidungslogik → geofrey weiß wann Plan-Mode sinnvoll ist
- Cowork-Architektur → Verständnis wohin Anthropic geht

---

## Aktueller Stand (2026-03-24 Ende)

**Was funktioniert:**
- `python main.py post "Thema"` — Kompletter LinkedIn Flow (Post + Bild-Prompts)
- `python main.py chat` — Orchestrator-Modus (User → Claude Code Command)
- `python main.py task "fix login in meus"` — Single Task
- `python main.py status` — 6 Collections, 313 Chunks
- `python main.py learn` — Session Intelligence: Learnings aus Claude Code Sessions extrahieren
- `python main.py learnings` — Learnings anzeigen/durchsuchen (RAG)
- `python main.py context-setup / linkedin-ingest / sessions-ingest / inbox / embed`
- `python main.py hub-query "DSGVO" --collections context_personal,knowledge`
- `python main.py status` — 7 Collections, 97 Claude Code Chunks + session_learnings

**Was noch fehlt (Phase 1):**
- Gemini API für automatische Bildgenerierung (verschoben)
- ~~Automatische Wissens-Persistenz nach Claude Code Sessions~~ ✓ (Session Intelligence)
- Mehr LinkedIn Posts importieren (User liefert > 38)

**Was noch fehlt (Phase 2+):**
- Native macOS UI (SwiftUI)
- Feedback-Loop (User korrigiert → geofrey lernt)
- Proaktive Vorschläge
- Automatisches Re-Indexing

---

## 2026-03-25 — gstack Pattern Integration

**Quelle:** [gstack](https://github.com/garrytan/gstack) von Garry Tan (YC President) — AI Engineering Framework mit 28 Claude Code Skills, Template-basiertem Prompt-System, Quality Gates, Multi-Model Review, Browser Automation.

### Warum diese Integration?

geofreys Orchestrator war bisher ein "dummer Weiterreicher" — ein einziger generischer Prompt für alle Tasks, keine Validierung der generierten Commands, kein Bewusstsein für Kontext (welche Files haben sich geändert?). Das führte zu drei konkreten Problemen:

1. **Gleicher Prompt für alles:** "Fix einen Bug" und "Review den Code" bekamen den identischen System-Prompt. Aber ein Review braucht `--permission-mode plan` (read-only) und opus, ein Bug-Fix braucht sonnet und mehr Budget. Das 9B-Modell musste jedes Mal selbst herausfinden was die richtige Konfiguration ist — und lag oft daneben.

2. **Keine Safety-Nets nach der LLM-Generierung:** Wenn Qwen3.5 einen Command ohne `--cwd` oder `--max-budget-usd` generierte, wurde das direkt dem User zur Bestätigung angezeigt. Kein Check, kein Hinweis. Der User musste selbst wissen ob der Command korrekt war.

3. **Prompts in Python eingesperrt:** Alle 6 Prompts waren hardcoded Strings in `brain/prompts.py`. Um einen Prompt anzupassen, musste man Python-Code editieren, auf JSON-Escaping achten (`{{` vs `{`), und testen. Nicht praktikabel für schnelle Iterationen.

gstack löst genau diese Probleme in seinem Ökosystem — mit 28 spezialisierten Skills, Template-basiertem Prompt-System, und Quality Gates. Wir haben die relevanten Patterns adaptiert: runterskaliert auf 7 Skills (statt 28), Python statt TypeScript, `str.replace()` statt komplexer Resolver, und Keyword-Matching statt LLM-Klassifikation (zu teuer für 9B).

Das Ergebnis: geofrey ist von einem passiven Prompt-Weiterreicher zu einem **intelligenten Dispatcher** geworden, der versteht was der User will, den richtigen Skill wählt, und den generierten Command validiert bevor er ausgeführt wird.

### Was analysiert wurde:
- 28 spezialisierte Skill-Templates (Planning, Code Review, QA, Security, Deployment)
- Template-System mit `.md.tmpl` + `{{PLACEHOLDER}}` Substitution
- Quality Gates: Test-Coverage Enforcement (60% Block, 80% Target)
- Diff Scope Detection: File-Änderungen kategorisieren (Frontend/Backend/Tests/Docs/Config)
- Progressive Context Tiers (T1-T4)
- Retro-Skill für Session-Analyse

**Was übernommen wurde (adaptiert für 9B + Python):**

1. **Prompt Template Files** — 6 hardcoded Strings aus `brain/prompts.py` → Markdown-Dateien in `brain/templates/`
   - **Warum:** Prompts waren in Python eingesperrt. JSON-Escaping (`{{` vs `{`) machte das Editieren fehleranfällig. Nicht-Programmierer konnten Prompts nicht anpassen. Mit Markdown-Templates kann jeder die Prompts lesen und bearbeiten.
   - `load_template(name)` und `render_template(name, **kwargs)` mit `{{variable}}` Substitution
   - `str.replace()` statt `.format()` — kein Escaping-Problem bei JSON in Prompts
   - Rückwärts-kompatible Konstanten bleiben erhalten (bestehende Imports brechen nicht)

2. **Skill-Based Task Routing** — 6 Task-Typen statt einem generischen Prompt
   - **Warum:** Ein generischer Prompt für alles zwingt das 9B-Modell jedes Mal selbst herauszufinden welches Modell, welches Budget, welche Flags nötig sind. Das klappt oft nicht. Spezialisierte Skills geben dem LLM die richtige Konfiguration vor — weniger Fehler, bessere Commands.
   - code-fix, feature, review, research, security, refactor
   - Keyword-Matching (DE + EN), deterministisch, kein LLM-Call nötig
   - Jeder Skill hat eigene Model/Budget/Flag-Empfehlungen
   - Shared Base Rules via `{{base_rules}}` Template-Fragment (DRY, kein Copy-Paste)

3. **Quality Gates** — Pre-Execution Validierung in `brain/gates.py`
   - **Warum:** Wenn Qwen3.5 einen Command ohne `--cwd` oder `--budget` generiert, wird das ungeprüft dem User gezeigt. Der User muss selbst wissen ob alles korrekt ist. Quality Gates fangen solche Fehler automatisch ab — defense in depth, zusätzlich zu den Safety-Chunks die schon im Prompt stecken.
   - [BLOCK]: Missing --cwd, missing --max-budget-usd, invalid path
   - [WARN]: Dangerous patterns (rm -rf, force push), secrets in prompts
   - Integriert in `execute_command()` — kritische Issues blocken Ausführung

4. **Diff Scope Detection** — `brain/scope.py`
   - **Warum:** Ohne Kontext über den aktuellen Zustand eines Projekts generiert geofrey generische Commands. Wenn er weiß dass gerade 5 Backend-Files und 2 Test-Files geändert sind, kann er gezielter arbeiten — z.B. "run tests" vorschlagen oder den Scope im Claude Code Prompt einschränken.
   - Kategorisiert git-Änderungen: frontend, backend, tests, docs, config, scripts
   - Injiziert Scope-Summary in Orchestrator-Kontext wenn Projekt erkannt
   - Tests haben Priorität (test_foo.py → "tests", nicht "backend")

5. **Knowledge Base Expansion** — 7 neue Chunks (97 → 104, dann +6 = 110 mit doc-sync + commands)
   - **Warum:** geofrey nutzt RAG um Kontext für die Command-Generierung zu finden. Ohne Knowledge über Skill-Architektur, Quality Gates, Diff Scope etc. kann er diese Patterns nicht anwenden. Die Chunks sind die "Erinnerung" die das 9B-Modell braucht.
   - skills-architecture-patterns.md, workflow-quality-gates.md, workflow-retro-sessions.md
   - workflow-diff-scope.md, prompt-template-system.md, context-progressive-tiers.md
   - safety-quality-gates.md

**Was bewusst NICHT übernommen wurde (und warum):**
- **Browser Automation** — anderer Use Case. geofrey orchestriert Claude Code, er macht kein QA/Testing von Web-Apps.
- **TypeScript/Bun Tooling** — geofrey ist Python. Die Patterns sind übertragbar, die Implementierung nicht.
- **Multi-Model Consensus (Claude + Codex)** — erfordert OpenAI API Key + Kosten. geofrey's Prinzip ist local-first mit Qwen3.5, Claude Code nur über CLI.
- **Git Worktree Management** — Claude Code handled Worktrees nativ. Kein Grund das zu duplizieren.
- **Supabase Backend** — geofrey ist local-first, kein Cloud-Backend nötig.
- **Office Hours / CEO Review / Design Consultation** — Strategische Consulting-Tools, zu komplex für 9B. Notiert für Phase 3/4 wenn ggf. größeres Modell.

**Neue Dateien:**
```
brain/
├── templates/         # 7 Markdown-Templates (6 Prompts + base-rules)
├── skills/            # 7 Skill-Templates (code-fix, feature, review, research, security, refactor, doc-sync)
├── router.py          # Task-Type Detection + Skill Dispatch
├── gates.py           # Pre-Execution Quality Gate Validation
└── scope.py           # Diff Scope Detection
knowledge-base/claude-code/
├── skills/skills-architecture-patterns.md
├── workflows/workflow-quality-gates.md
├── workflows/workflow-retro-sessions.md
├── workflows/workflow-diff-scope.md
├── workflows/workflow-doc-sync.md
├── prompt-templates/prompt-template-system.md
├── context/context-progressive-tiers.md
└── safety/safety-quality-gates.md
```

### Doc-Sync Skill (Nachtrag, gleiche Session)

**Quelle:** YouTube-Analyse eines gstack-Walkthroughs. Der Ersteller zeigt 5 der 28 Skills im Detail: Office Hours, CEO Review, Design Consultation, Engineering Review, und **Document Release**. Letzterer war in der reinen Code-Analyse untergegangen.

**Was Document Release macht:**
1. Findet alle Diffs (geänderte Files)
2. Inventarisiert alle Docs (.md, README, Changelogs, Architecture)
3. Cross-referenziert Code-Änderungen gegen Docs
4. Erkennt Konflikte (Code hat sich geändert, Docs nicht)
5. Updated veraltete Docs automatisch
6. Prüft auf dangling TODOs
7. Stellt Changelog-Konsistenz sicher

**Problem das es löst:** Die "Snake in the Grass" — Code ändert sich schnell, Docs werden nicht aktualisiert, 2 Tage später nutzt Claude Code veraltete Docs als Kontext und generiert falschen Code.

**Was gebaut wurde:**
- `brain/skills/doc-sync.md` — Skill-Template mit 7-Schritt Workflow, sonnet, $1-3 Budget
- `knowledge-base/claude-code/workflows/workflow-doc-sync.md` — Knowledge Chunk damit geofrey versteht was Doc-Sync ist und wann es nötig ist
- Router-Keywords (DE+EN): "doc", "docs", "documentation", "sync", "changelog", "readme", "journal", "doku", "dokumentation", "aktualisier", "release notes"

**Warum beides (Skill + Knowledge):**
- Ohne Knowledge Chunk weiß geofrey nicht **was** Doc-Sync ist (RAG liefert keinen Kontext)
- Ohne Skill kriegt er keinen spezialisierten Prompt (generischer Orchestrator-Prompt reicht nicht)
- Zusammen: Router erkennt Intent → Skill liefert den richtigen Prompt → RAG liefert den Kontext → Qwen3.5 generiert präzisen Claude Code Command

**Weitere Erkenntnisse aus dem Video (nicht implementiert, notiert für später):**
- **Office Hours** — Strukturierte Produkt-Validierung mit Fragenfluss (Wedge, Target User, Workarounds, Demand). Relevant für Slavkos Beratungs-Kunden, Phase 3/4.
- **CEO Review** — Adversarial Strategy Review: sucht "10-Star Produkt" im aktuellen Produkt, bietet scope expansion/reduction. Interessant aber zu komplex für 9B.
- **Design Consultation** — Wettbewerber-Recherche + Design-System Generation. Nicht relevant da geofrey kein UI-Design-Tool ist.

---

## 2026-03-25 — Python-First Architecture

### Das Problem

geofrey ließ den lokalen LLM (Qwen3.5-9B) den **gesamten** Claude Code CLI-Befehl generieren — inklusive `--cwd`, `--model`, `--max-turns`, `--max-budget-usd`. Python validierte danach mit Quality Gates und extrahierte den Command per Regex (`extract_command()`).

Das war rückwärts: Ein 9B-Modell generierte deterministische CLI-Syntax, und Python baute Sicherheitsnetze drumherum. Die Quality Gates und Regex-Extraction existierten nur, weil der LLM Fehler machte bei Dingen, die Python trivial richtig machen kann.

### Die Lösung: Python-First

**Neue Architektur:**
```
User Input
  → Python: detect_task_type()        # Keyword-Matching
  → Python: get_skill_meta()          # Config-basierte Defaults
  → Python: retrieve_context()        # RAG (unverändert)
  → LLM:    generate_prompt()         # NUR der -p Prompt-Text
  → Python: validate_prompt()         # Secrets/Dangerous Check
  → Python: build_command()           # Deterministisch: --model, --cwd, --budget
  → Python: [Plan-Phase wenn nötig]   # read-only vor execution
  → User:   Bestätigung
  → Execute
```

**Kernprinzip:** Python macht alles Deterministische. Der LLM schreibt nur den Prompt-Text — das Einzige wofür Sprachverständnis nötig ist.

### Was sich geändert hat

**Neues Modul — `brain/command.py`:**
- `CommandSpec` Dataclass — strukturierte Command-Spezifikation
- `build_command()` — assembliert CLI-String mit `shlex.quote()` Escaping
- `resolve_model()` — mapped model_category auf Model-Alias via Config
- `project_has_code()` — prüft ob Projekt existierenden Code hat

**Model-Policy — `config/config.yaml`:**
```yaml
model_policy:
  code: "opus"       # code-fix, feature, refactor → immer Opus
  analysis: "opus"   # review, research, security → immer Opus
  content: "sonnet"  # doc-sync, linkedin → Sonnet
```
User zahlt $200/Monat für Max 20x Plan. Kosten sind kein Faktor.

**Skill-Defaults — `config/config.yaml`:**
- Budget, Turns, Permission-Mode, Plan-Phase pro Skill konfigurierbar
- Feature + Refactor bekommen automatische Plan-Phase (`needs_plan: true`)

**Router-Erweiterung — `brain/router.py`:**
- Neue `SkillMeta` Dataclass mit allen Metadaten
- `get_skill_meta()` liest aus Config, fällt auf Defaults zurück

**Orchestrator-Umbau — `brain/orchestrator.py`:**
- `generate_prompt()` — LLM schreibt nur Prompt-Text (kein Code-Block)
- `execute_spec()` — validiert und führt CommandSpec aus
- `run_two_phase()` — Plan-Phase (read-only) → User-Bestätigung → Execution
- `detect_project()` — Projekt-Erkennung als eigene Funktion
- Backward-Compat: `chat()`, `extract_command()`, `execute_command()` bleiben als deprecated

**Vereinfachte Skill-Templates — `brain/skills/*.md`:**
- Kein CLI-Syntax mehr — Templates leiten LLM nur beim Prompt-Schreiben an
- `{{base_rules}}` Placeholder entfällt

**Gelöschte Datei — `brain/templates/base-rules.md`:**
- CLI-Syntax lebt jetzt in `command.py`, nicht im LLM-Kontext

**Vereinfachte Gates — `brain/gates.py`:**
- Neue `validate_prompt()` prüft nur Secrets/Dangerous Patterns
- Strukturelle Checks (--cwd, --budget) entfallen — Python garantiert diese

### Zwei-Phasen Plan-Mode

Für Feature und Refactor auf bestehenden Projekten:

1. **Phase 1 (Plan):** Claude Code mit `--permission-mode plan` (read-only). Analysiert Codebase, gibt Plan aus. Reduziertes Budget ($2, 15 turns).
2. **User sieht Plan → bestätigt oder bricht ab**
3. **Phase 2 (Execute):** Claude Code mit vollem Budget. Plan wird als Kontext mitgegeben.

Trigger: `skill_meta.needs_plan == True` UND `project_has_code(path) == True`

### Knowledge Base — Rolle ändert sich

Die Knowledge Base wird NICHT durch Python ersetzt. Die Aufteilung:
- **Python-Code:** CLI-Syntax, Modellwahl, Budget, Routing, Gates (deterministisch)
- **Knowledge Base (RAG):** Prompt-Qualität, Best Practices, DACH-Kontext, Safety-Awareness (nicht-deterministisch, Sprachverständnis nötig)

Der Zweck ändert sich: statt "lehre den LLM CLI-Syntax" ist es jetzt "gib dem LLM Kontext für bessere Prompts".

---

## 2026-03-25 — Re-Focus: Autonomer Personal Agent

### Vision-Shift

geofrey ist nicht mehr ein CLI-Wrapper für Claude Code. geofrey ist ein **autonomer Personal Agent** — ein zweites Ich das nie schläft.

**Warum der Re-Focus:**
Der bisherige Ansatz (LLM generiert CLI-Befehle, Python validiert danach) löste das falsche Problem. Der User braucht keinen Befehlsgenerator — er braucht ein System das:
1. Seinen Kontext kennt (Projekt, Codebase, Historie, DACH-Markt)
2. Besser prompten kann als er selbst (weil es den Kontext hat)
3. Autonom arbeitet während er schläft

**Der Schlüsselmoment:** 17 Zeichen User-Input ("fix den login bug") → 14.436 Zeichen angereicherter Prompt. Deterministisch, ohne LLM. Das ist der eigentliche Wert — nicht der CLI-Befehl, sondern der Kontext.

### Was gebaut wurde (alle 3 Säulen in einer Session)

#### Säule 1: Prompt Enrichment Engine

Deterministisch (Python, kein LLM). 7 Enrichment Rules als YAML-Dateien.

**Neue Dateien:**
- `brain/models.py` — Shared Dataclasses für alle Module (Task, Session, EnrichedPrompt, BriefingItem, EnrichmentRule)
- `brain/enricher.py` — Prompt Enrichment Engine: Regeln laden, Kontext sammeln, strukturierten Prompt bauen
- `brain/context_gatherer.py` — Kontext-Sammler: Git-Status, CLAUDE.md, Architecture-Docs, Session-Learnings aus ChromaDB, DACH-Kontext
- `brain/rules/*.yaml` — 7 Enrichment Rules (code-fix, feature, refactor, review, research, security, doc-sync)

**Enrichment Flow:**
```
User Input (17 chars)
  → detect_task_type() → "code-fix"
  → gather_project_context() → Git, Docs, ChromaDB
  → load_enrichment_rules() → code-fix.yaml
  → _build_enriched_prompt() → 14.436 chars
```

**Kontext-Quellen pro Rule:**
- Git Branch/Status/Commits (immer außer research)
- Diff Scope — kategorisierte File-Änderungen (immer außer research)
- CLAUDE.md (immer außer research)
- Architecture-Docs (bei feature, refactor, review, security, doc-sync)
- Session Learnings aus ChromaDB (immer)
- DACH-Kontext (bei review, research, security)
- Post-Actions als Requirements (rule-spezifisch)
- Prompt-Suffix (rule-spezifisch)

#### Säule 2: Session Automation

tmux-basierte Session-Verwaltung mit `--dangerously-skip-permissions`.

**Neue Dateien:**
- `brain/session.py` — Session Manager: tmux starten (`start_session`), überwachen (`get_session_status`), Output capturen (`capture_session_output`), beenden (`end_session`), synchrone Ausführung (`run_session_sync`)

**Session Lifecycle:**
```
1. tmux new-session -d -s geofrey-{id} "claude --dangerously-skip-permissions ..."
2. tmux has-session → RUNNING / COMPLETED
3. tmux capture-pane → Output
4. Session Intelligence → Learnings extrahieren
```

#### Säule 3: Overnight Agent

Task Queue + Daemon + Morning Briefing.

**Neue Dateien:**
- `brain/queue.py` — SQLite-backed Task Queue unter `~/.knowledge/geofrey_tasks.db`. CRUD, Priority-Ordering, Dependency-Checks
- `brain/daemon.py` — Overnight Daemon: Queue abarbeiten, Briefing generieren. launchd Plist für 02:00 Schedule
- `brain/briefing.py` — Morning Briefing: Tasks kategorisieren (erledigt, Freigabe, Input nötig, Status), Terminal-Formatierung, JSON+MD Export nach `~/.knowledge/briefing.md`
- `brain/agents/base.py` — BaseAgent + run_agent() Factory-Dispatcher. Alle Agent-Typen (coder, researcher, content, documenter) routen aktuell durch Claude Code

**Overnight Flow:**
```
1. User (tagsüber): geofrey queue add "refactor auth" --project meus
2. Daemon (02:00): run_overnight()
3. Für jeden Task: detect_type → enrich → agent → Claude Code
4. generate_briefing() → briefing.md + briefing.json
5. User (morgens): geofrey briefing
```

### Neue CLI Commands (6 neue)

```bash
geofrey queue add "task" --project X --priority high --agent coder
geofrey queue list [--status done|pending|failed|needs_input]
geofrey queue process [--max 10]
geofrey overnight                   # Voller Overnight-Zyklus
geofrey briefing                    # Morning Briefing anzeigen
geofrey install-daemon              # launchd Plist generieren
```

### Zusammenfassung

| Vorher | Nachher |
|---|---|
| CLI-Wrapper: LLM generiert CLI-Befehle | Autonomer Agent: deterministisches Prompt Enrichment |
| User muss Commands bestätigen | User queued Tasks, geofrey arbeitet nachts |
| Kein Session-Management | tmux-basierte Session Automation |
| Kein Briefing | Morning Briefing mit Kategorien |
| Generischer Prompt für alles | 7 YAML-basierte Enrichment Rules |
| LLM für alles | Python für Deterministisches, LLM nur wo nötig |

---

## Aktueller Stand (2026-03-25 Ende)

**Was funktioniert (Phase 1 — Terminal CLI):**
- `python main.py chat` — Orchestrator mit Skill-Routing (7 Skills)
- `python main.py task "fix login in meus"` — Single Task mit Prompt Enrichment
- `python main.py skills` — Verfügbare Skills
- `python main.py post "Thema"` — Kompletter LinkedIn Flow (Post + Bild-Prompts)
- `python main.py learn` — Session Intelligence: Learnings extrahieren
- `python main.py learnings` — Learnings anzeigen/durchsuchen (RAG)
- `python main.py queue add/list/process` — Task Queue Management
- `python main.py overnight` — Voller Overnight-Zyklus (Queue + Briefing)
- `python main.py briefing` — Morning Briefing anzeigen
- `python main.py install-daemon` — launchd Plist für Nacht-Automatisierung
- `python main.py status` — 7 Collections, 110 Claude Code Knowledge Chunks
- `python main.py context-setup / linkedin-ingest / sessions-ingest / inbox / embed / hub-query`

**Architektur (Drei Säulen):**
- Prompt Enrichment Engine — 17 chars → 14.436 chars, deterministisch
- Session Automation — tmux-basiert, start/monitor/capture
- Overnight Agent — launchd Daemon (02:00), Task Queue, Morning Briefing
- Agent System — BaseAgent + Factory-Dispatcher (4 Agent-Typen)
- 7 Enrichment Rules als YAML (brain/rules/)
- Shared Data Models (brain/models.py)
- Model-Policy — Opus für Code/Analysis, Sonnet für Content
- Skill-Based Task Routing — 7 Skills mit DE+EN Keywords

**Knowledge Base:**
- 110 Claude Code Chunks
- 5 DACH-Kontext Dateien
- 38 LinkedIn Posts
- Session Learnings (persistent)

**Was noch fehlt (Phase 1):**
- Gemini API für automatische Bildgenerierung (verschoben)
- Mehr LinkedIn Posts importieren (User liefert > 38)

**Was noch fehlt (Phase 2+):**
- Native macOS UI (SwiftUI)
- Proaktive Vorschläge
- Feedback-Loop
- Automatisches Re-Indexing
- Website-Automatisierung (geofrey.ai)

---

## 2026-03-26 — Safety Hardening + Decision Dependency Research

### Kontext

Session begann mit dem Weitermachen an Router Keyword-Kollisionen (Commit 934c47f), eskalierte zu einem vollständigen Projekt-Review, und mündete in der Entdeckung des Decision Dependency Problems — einer fundamentalen Lücke in allen AI Coding Assistants.

### Was gebaut wurde

#### 1. Permission Model (session.py)
**Commit:** (dieser Batch)
**Warum:** `--dangerously-skip-permissions` war in ALLEN Sessions hardcoded. Das ist gefährlich für autonome Overnight-Execution wo niemand reviewt. SkillMeta hatte bereits `permission_mode` pro Task-Typ, aber es wurde nie an session.py durchgereicht.
**Was:** `_build_claude_cmd()` zentralisiert Command-Bau mit 3 Modi: `skip` (autonomous), `default` (user approves), `plan` (read-only). Daemon übergibt `permission_mode` aus SkillMeta → agent_config → BaseAgent → session.
**Betrifft:** brain/session.py, brain/agents/base.py, brain/daemon.py

#### 2. Safety Konsolidierung (gates.py, safety.py gelöscht)
**Commit:** (dieser Batch)
**Warum:** Drei disconnected Safety-Systeme existierten: safety.py (RAG-Chunks, nie in Enricher integriert), gates.py (nur [WARN], nie [BLOCK]), Claude Code's eigene Safety. Keines war mit dem anderen verbunden. safety.py's `get_safety_context()` wurde nur in der orphaned `retrieve_context()` aufgerufen.
**Was:** safety.py gelöscht. gates.py mit Regex-basierten [BLOCK] Patterns erweitert (rm -rf /, drop database, force push main/master). `has_blockers()` funktioniert jetzt tatsächlich.
**Betrifft:** brain/gates.py (rewritten), brain/safety.py (deleted), brain/orchestrator.py (imports cleaned)

#### 3. Dead Code Cleanup
**Commit:** (dieser Batch)
**Warum:** Projekt-Review identifizierte orphaned Code: `retrieve_context()` (Legacy RAG, nicht im aktiven Flow), `get_projects_text()` (nirgends aufgerufen), `validate_command()` (deprecated), unused Model Fields.
**Was entfernt:**
- `orchestrator.retrieve_context()` — ersetzt durch Enricher Pipeline
- `orchestrator.get_projects_text()` — nirgends verwendet
- `gates.validate_command()` — deprecated, Command-Struktur von Python garantiert
- `Session.output` + `Session.learnings_extracted` — nie populated
- `ProjectContext.known_issues` — nie populated
- Imports: os, chromadb, ollama aus orchestrator.py (nur für gelöschte Funktionen)

#### 4. Briefing Memory
**Commit:** (dieser Batch)
**Warum:** `get_overnight_summary()` gab ALLE completed Tasks zurück, nicht nur seit dem letzten Briefing. Das Morning Briefing zeigte immer die gleichen Tasks.
**Was:** `meta` Tabelle in SQLite für `last_briefing_at` Timestamp. `get_overnight_summary()` filtert jetzt auf Tasks nach dem letzten Briefing. `show_briefing()` ruft `mark_briefing_shown()` auf.
**Betrifft:** brain/queue.py, brain/briefing.py

#### 5. Decision Dependency System — Research & Plugin
**Warum:** Beim Projekt-Review fiel auf: Claude Code weiß nicht WARUM Code so ist wie er ist. Sieht State, nicht Intent. Führt zu Loops wo bewusste Entscheidungen rückgängig gemacht werden. Keine Lösung existiert — nicht in Claude Code, nicht in Cursor, Copilot, Aider.
**Was gebaut:**
- `docs/decision-dependency-system.md` — Vollständige Research: Problem, Stand der Technik (5 Papers, 8 Tools), Architektur-Entwurf, Quellen
- `~/Code/decision-guard/` — Separates Projekt: Claude Code Plugin mit 4 Skills + 4 Hooks. Zero Dependencies, pure Shell+Markdown. Getestet (10/10 Tests bestanden).
**Was kommt als nächstes:** Volle Python-Implementierung direkt in geofrey's Enricher (Plan liegt unter .claude/plans/). ChromaDB Semantic Search, Dependency Graph Walker, automatische Extraction aus Sessions.

### Tests

167 Tests → alle bestanden nach den Änderungen. 11 neue Tests:
- 4 TestGatesExtended: [BLOCK] vs [WARN] Pattern Validation
- 4 TestSessionPermissions: permission_mode in _build_claude_cmd() und run_session_sync()
- 3 TestBriefingMemory: mark_briefing_shown(), Filter by Last Briefing, No Briefing Shows All

### Architektur-Entscheidungen

| Entscheidung | Warum | Betrifft |
|---|---|---|
| safety.py gelöscht, gates.py ist Single Source of Truth | 3 disconnected Systeme, safety.py war nie integriert | Wer Safety ändern will → nur gates.py |
| Permission Mode per Skill statt global --dangerously-skip-permissions | Overnight Security Tasks sollten nicht alles überspringen | session.py, daemon.py, agents/base.py |
| Briefing Memory in SQLite meta Tabelle | Kein neues Storage-System, meta Tabelle existierte bereits | queue.py, briefing.py |
| Decision Dependency als Python-Code in geofrey, nicht als Plugin | geofrey sitzt VOR dem LLM → 100% deterministische Injection, ChromaDB Semantic Search, automatische Extraction | Enricher Pipeline, neue Dateien |

---

## 2026-03-27 — Decision Dependency System Implementation + Projekt-Audit

### Kontext

Volle Implementierung des Decision Dependency Systems (6 Schritte, 6 Commits) + Remote-Control für Claude App Visibility + Dokumentation (README, CLAUDE.md, Architecture Update) + vollständige Projektanalyse.

### Was gebaut wurde

#### 1. Decision Dependency System — 6 Commits

| Schritt | Commit | Was |
|---------|--------|-----|
| 1 | `66f9aab` | Decision Dataclass in models.py, ProjectContext.decision_context, EnrichmentRule.include_decision_context |
| 2 | `633b6b6` | `knowledge/decisions.py` — Load, Index, Query (semantic), Scope-Matching, Dependency Walker |
| 3 | `1d9c4c6` | `brain/decision_checker.py` — 3-Level Conflict Detection (Scope, Keyword, Semantic) |
| 4 | `11861ab` | Enricher Integration — gather_decision_context(), "## Active Decisions" Section, 7 YAML Rules |
| 5 | `e2a9492` | Session Intelligence erweitert — structured Decision Extraction, auto-save als Markdown |
| 6 | `a8dc28f` | Config, CLI Commands (decisions list/check/index), 30 Tests (alle grün) |

**Architektur-Kern:** Decisions als Markdown+YAML Frontmatter (Source of Truth) + ChromaDB als semantischer Index. Drei Matching-Level: Scope-Overlap → Keyword → ChromaDB Embedding Similarity. Python Graph Traversal für Dependency Chains (depends_on, enables). Alles deterministisch, kein LLM im kritischen Pfad.

#### 2. Remote-Control für Claude App
**Commit:** `a8734bb`
**Warum:** Jede geofrey-Session soll in der Claude App sichtbar und interagierbar sein.
**Was:** Sessions starten jetzt interaktiv (kein `-p` Flag), `/remote-control` wird via tmux send-keys gesendet, Prompt via tmux load-buffer/paste-buffer (handelt 14K+ Zeichen).
**Betrifft:** brain/session.py

#### 3. Dokumentation — Repo Prod-Ready
**Commit:** `d066961`
- **README.md** erstellt — Englisch, Decision Dependency System als Kernfeature, Quick Start, CLI, Tech Stack
- **CLAUDE.md** aktualisiert — decision_checker.py, decisions.py, decisions Collection, CLI Commands
- **docs/architecture.md** aktualisiert — Decision System Section mit Flow-Diagramm, Architektur-Tabelle, Format, Lifecycle
- **Seed Decisions** — DEC-001 (Safety Consolidation) + DEC-002 (Permission Model) in knowledge-base/decisions/geofrey/

### Vollständige Projektanalyse — Phase 1 Bewertung

#### Zielvorgabe vs. Realität

| Phase | Status | Bewertung |
|-------|--------|-----------|
| Phase 1: Core (Terminal) | **95% fertig** | Nur Gemini API deferred (manuell reicht) |
| Phase 2: Native UI | 0% | Nicht gestartet |
| Phase 3: Proaktive Intelligenz | 0% | Nicht gestartet |
| Phase 4: Extensions | 0% | Nicht gestartet |

#### Ideologie: "Python-First, kein LLM im kritischen Pfad"

**Eingehalten.** LLM wird nur an 3 Stellen im Produktionscode verwendet:
1. `intelligence.py` — Session Learnings extrahieren (Post-Processing, nicht kritischer Pfad)
2. `linkedin.py` — Content-Generierung (by Design)
3. `ollama.embed` — Vektor-Encoding für ChromaDB (kein Reasoning)

Der gesamte Enrichment-Flow (Routing → Context → Decisions → Prompt → Safety → Command) ist 100% deterministischer Python-Code.

#### Code-Zustand

| Metrik | Ergebnis |
|--------|----------|
| Python-Module | 24 (16 brain/ + 8 knowledge/) — alle komplett |
| Stubs / TODO / FIXME | 0 |
| Dead Code | 0 |
| CLI Commands | 23 — alle funktionsfähig |
| ChromaDB Collections | 7 konfiguriert |
| Enrichment Rules | 7 YAML + 7 Skill Templates |
| Tests | 197 in 8 Dateien |
| Docstrings (Module) | 100% |
| Git Status | Clean, alles committed + pushed |

#### Logik: Der Kreislauf ist geschlossen

```
User Input → detect_task_type() → enrich_prompt() → check_decisions()
→ validate_prompt() → execute (frische Session) → post_process()
→ extract_learnings() → index → nächste Session profitiert
```

Jede Session lernt. Jede neue Session bekommt Learnings + Decisions injiziert. Frische Session mit angereichertem Kontext > lange Session mit Context Drift.

#### Offene Punkte

| Thema | Priorität | Status |
|-------|-----------|--------|
| Test-Fixes (Import-Fehler, Mock-Setup) | Hoch | Offen |
| E2E-Test mit echtem Live-Task | Hoch | Offen |
| CLAUDE.md: safety.py Referenz entfernen | Quick Fix | Offen |
| Gemini API (Bild-Generierung) | Niedrig | Bewusst deferred |
| Phase 2: macOS SwiftUI UI | Mittel | Eigenständiges Projekt |

### Architektur-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Decision System als Python-Code im Enricher | geofrey sitzt VOR dem LLM → 100% deterministische Injection, nicht 60-75% CLAUDE.md Compliance |
| Markdown+YAML als Decision Format | Kompatibel mit decision-guard Plugin, maschinenlesbar, Source of Truth |
| 3-Level Matching (Scope → Keyword → Semantic) | Scope ist präzise, Keywords sind schnell, Semantic fängt Edge Cases |
| Sessions interaktiv starten für /remote-control | Jede Session in Claude App sichtbar und interagierbar |
| Prompt via tmux load-buffer statt send-keys | Handelt 14K+ Zeichen zuverlässig |

---

## 2026-03-28 — Offene Punkte abgearbeitet

### Erledigte Punkte

| Punkt | Lösung |
|-------|--------|
| Test-Fixes (Import-Fehler, Mock-Setup) | decisions.py defensive config access + session test mock assertion → 197/197 pass |
| CLAUDE.md: safety.py Referenz | War bereits bereinigt |
| Knowledge Base Chunks reviewen | 33 redundante Chunks gelöscht (CLI-Flags, Permissions, Models, Env-Vars, Commands, System-Prompt). 110 → 77 Chunks. Python handled den Rest deterministisch. |
| CLI_Maestro / knowledge-assistant | User-Entscheidung: Löschen. Alles ist in geofrey migriert. |

### Offene Punkte

| Punkt | Status |
|-------|--------|
| LinkedIn Daten-Export | User macht das separat |
| E2E-Test mit echtem Live-Task | Nächste Session |
| Phase 2: macOS SwiftUI UI | Eigenständiges Projekt, Zeitpunkt offen |

## Offene Fragen

### TODO: Selbstverbesserung (5 Feedback-Loops)

Detaillierte Analyse: [docs/self-improvement-roadmap.md](self-improvement-roadmap.md)

1. **Routing Feedback** — User kann falsches Routing korrigieren → geofrey lernt
2. **Decision Staleness** — valid_until + 90-Tage Warning für veraltete Decisions
3. **Outcome Tracking** — exit_code + duration nach jeder Session loggen
4. **Keyword Evolution** — neue User-Wörter automatisch lernen
5. **Section Relevanz** — welche Enrichment-Sections liefern Wert?

---

## Regeln für die Weiterentwicklung

1. **Immer gegen die Vision prüfen** (docs/vision.md)
2. **Knowledge Base ist King** — Markdown-Dateien sind Source of Truth
3. **Safety first** — keine Ausnahmen
4. **Keep it simple** — keine Frameworks die nicht nötig sind
5. **Journal pflegen** — jede Session dokumentieren
6. **Testen vor Commit**
7. **think=False** bei allen Qwen3.5 Ollama-Calls
