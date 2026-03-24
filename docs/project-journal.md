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

## Offene Fragen

1. Sollen CLI_Maestro und knowledge-assistant als Archive bestehen bleiben oder gelöscht werden?
2. Wann starten wir mit der nativen macOS UI?
3. Gemini API-Anbindung: welches Modell für Bildgenerierung?
4. Soll geofrey auch ohne UI nutzbar sein (reines Terminal)?

---

## Regeln für die Weiterentwicklung

1. **Immer gegen die Vision prüfen** (docs/vision.md)
2. **Knowledge Base ist King** — Markdown-Dateien sind Source of Truth
3. **Safety first** — keine Ausnahmen
4. **Keep it simple** — keine Frameworks die nicht nötig sind
5. **Journal pflegen** — jede Session dokumentieren
6. **Testen vor Commit**
7. **think=False** bei allen Qwen3.5 Ollama-Calls
