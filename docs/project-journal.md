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
- `python main.py status` — 7 Collections inkl. session_learnings

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

## Offene Fragen

1. Sollen CLI_Maestro und knowledge-assistant als Archive bestehen bleiben oder gelöscht werden?
2. Wann starten wir mit der nativen macOS UI?
3. Mehr LinkedIn Posts: User muss LinkedIn Daten-Export machen
4. Soll geofrey einen eigenen Cron-Job für Knowledge-Updates bekommen?

---

## Regeln für die Weiterentwicklung

1. **Immer gegen die Vision prüfen** (docs/vision.md)
2. **Knowledge Base ist King** — Markdown-Dateien sind Source of Truth
3. **Safety first** — keine Ausnahmen
4. **Keep it simple** — keine Frameworks die nicht nötig sind
5. **Journal pflegen** — jede Session dokumentieren
6. **Testen vor Commit**
7. **think=False** bei allen Qwen3.5 Ollama-Calls
