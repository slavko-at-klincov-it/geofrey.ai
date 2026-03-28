# geofrey — Vision & Roadmap

## Die Vision

geofrey ist Slavkos autonomer Personal Agent — ein zweites Ich das nie schläft. geofrey kennt den User, seinen Markt (DACH), seine Projekte, seinen Schreibstil, und weiß was zu tun ist bevor man es sagt.

**Kernprinzip:** Ein System das den Kontext kennt, kann besser prompten als ich.

geofrey ist kein Chatbot und kein CLI-Wrapper. geofrey ist ein autonomer Agent der:
- Jeden Input automatisch mit dem richtigen Kontext anreichert (17 Zeichen → 14.436 Zeichen)
- Claude Code Sessions autonom startet, überwacht und Learnings extrahiert
- Tasks über Nacht abarbeitet und ein Morning Briefing bereitstellt
- Mit jedem Gespräch dazulernt — Wissen bleibt persistent

## Architektur — Drei Säulen

```
User Input → Prompt Enrichment Engine → Session Manager → Claude Code CLI
                     ↓                         ↓
              Knowledge Layer            Overnight Daemon
              (ChromaDB, Learnings)      (Task Queue, Agents)
                                               ↓
                                         Morning Briefing
```

1. **Prompt Enrichment** — Deterministisch (Python, kein LLM): Git-Status, CLAUDE.md, Diff Scope, Session Learnings, DACH-Kontext, Enrichment Rules pro Task-Typ
2. **Session Automation** — tmux-basiert: Claude Code starten, überwachen, Output capturen, Learnings extrahieren
3. **Overnight Agent** — launchd Daemon (02:00): Task Queue abarbeiten, Agents dispatchen, Morning Briefing generieren

## Kern-Prinzipien

1. **Local-First:** Alles läuft lokal. Keine Cloud-Abhängigkeit für die Kernfunktionen. Claude Code und Gemini sind externe Tools die geofrey aufruft, aber geofrey selbst braucht kein Internet.
2. **Stetig lernend:** Jede Interaktion macht geofrey schlauer. Recherche-Ergebnisse, bestätigte Posts, Session-Daten — alles fließt automatisch in die Wissensbasis.
3. **DACH-Kontext immer:** Slavko arbeitet im deutschsprachigen Raum. DSGVO, NIS2, EU Data Boundary, österreichisches Recht — das muss in jede Antwort einfließen, ohne dass man es jedes Mal sagen muss.
4. **Autonom arbeiten:** geofrey wartet nicht auf Anweisungen. User queued Tasks, geofrey arbeitet sie ab — nachts, im Hintergrund, ohne Aufsicht.
5. **Deterministisch wo möglich:** Prompt Enrichment, Routing, Command-Bau — alles Python, kein LLM nötig. LLM nur wo Sprachverständnis gebraucht wird.

## Use Cases

### 1. LinkedIn Post Pipeline
```
User: "Schreib einen Post über NIS2 für KMU"
  → geofrey holt Style Guide + ähnliche Posts + DACH-Kontext
  → geofrey generiert Post-Entwurf
  → geofrey öffnet Claude Code (Sonnet): "Erstelle 4 Bild-Prompt Vorschläge"
  → User sieht: Post-Entwurf + 4 Bild-Optionen im UI
  → User wählt, passt an, bestätigt
  → Post wird in Wissensbasis gespeichert
  → Bild-Prompt geht an Gemini → Bild kommt zurück
  → User kopiert beides auf LinkedIn
```

Bild-Stil-Vorlieben:
- Keine realen Fotos
- Sketches, Zeichnungen, Illustrationen
- Personen die etwas zeigen/erklären
- Whiteboards mit Diagrammen
- Fiktive Szenen, nicht fotorealistisch

### 2. Coding mit Prompt Enrichment
```
User: "fix den login bug" (17 Zeichen)
  → Prompt Enrichment Engine (deterministisch, kein LLM):
    → detect_task_type() → "code-fix"
    → gather_project_context() → Git-Status, Commits, Diff Scope, CLAUDE.md
    → load_enrichment_rules() → code-fix.yaml Regeln
    → _build_enriched_prompt() → 14.436 Zeichen strukturierter Prompt
  → Claude Code (Opus) bekommt vollen Kontext
  → Session in tmux → Output capturen → Learnings extrahieren
```

### 3. Overnight Agent
```
User (tagsüber): "geofrey queue add 'refactor auth module' --project meus --priority high"
User (tagsüber): "geofrey queue add 'security audit' --project geofrey"
User: schläft.

Daemon (02:00):
  → Pending Tasks aus Queue holen (Priority-Sortierung)
  → Für jeden Task: enrich → Agent → Claude Code
  → Ergebnisse speichern, Status updaten
  → Morning Briefing generieren

User (morgens): "geofrey briefing"
  → Erledigt: refactor auth module (3 Files geändert)
  → Zur Freigabe: Code-Änderungen reviewen [annehmen / ablehnen]
  → Brauche Input: Security Audit hat 2 Fragen zum Scope
  → Projekt-Status: meus (1 erledigt), geofrey (1 Input nötig)
```

### 4. Recherche mit Wissens-Persistenz
```
User: "Recherchier die NIS2 Änderungen für 2026"
  → geofrey → Claude Code (Opus): tiefe Recherche mit DACH-Kontext
  → Ergebnis wird zusammengefasst
  → Zusammenfassung landet automatisch im Knowledge Hub
  → Beim nächsten Mal weiß geofrey schon Bescheid
```

### 5. Geschäftsdokumente
```
User: "Schreib ein Angebot für Kunde X, Power Platform Beratung"
  → geofrey kennt DACH-Markt, Preise, Steuern
  → geofrey nutzt Claude Code für den Entwurf
  → DSGVO-konformes Angebot mit österreichischem Kontext
```

## Phasen

### Phase 1: Core (Terminal-basiert) — DONE
- [x] Knowledge Hub mit 6 Collections (2026-03-24)
- [x] DACH-Kontext Injection (2026-03-24)
- [x] Orchestrator-Logik (brain/) (2026-03-22/23, migriert 2026-03-24)
- [x] LinkedIn Post Ingestion + Style Guide (2026-03-24)
- [x] Session/Inbox Pipeline (2026-03-24)
- [x] Code-Migration von CLI_Maestro + knowledge-assistant nach geofrey (2026-03-24)
- [x] LinkedIn Post-Generierung End-to-End (2026-03-24)
- [x] Bild-Prompt Generierung via Claude Code Sonnet (2026-03-24)
- [x] Session Intelligence: Learnings aus Claude Code Sessions (2026-03-24)
- [x] Prompt Template Files (brain/templates/) — gstack Pattern (2026-03-25)
- [x] Skill-Based Task Routing — 7 Skills (2026-03-25)
- [x] Quality Gates (Pre-Execution Validierung) (2026-03-25)
- [x] Diff Scope Detection (2026-03-25)
- [x] Knowledge Base Expansion (97 → 77 Chunks) (2026-03-25)
- [x] Python-First Architecture — LLM nur für Prompt-Text (2026-03-25)
- [x] Model-Policy — Opus für Code/Analysis, Sonnet für Content (2026-03-25)
- [x] Zwei-Phasen Plan-Mode — Read-only vor Execution (2026-03-25)
- [x] **Prompt Enrichment Engine** — 17 chars → 14.436 chars, deterministisch (2026-03-25)
- [x] **Session Automation** — tmux-basiert, start/monitor/capture (2026-03-25)
- [x] **Task Queue** — SQLite-Backend, Priority-Ordering, CRUD (2026-03-25)
- [x] **Overnight Agent** — Daemon + Queue Processing + Briefing (2026-03-25)
- [x] **Morning Briefing** — Erledigt/Freigabe/Input/Status Kategorien (2026-03-25)
- [x] **Agent System** — BaseAgent + Factory-Dispatcher (2026-03-25)
- [x] **Enrichment Rules** — 7 YAML-Regeln pro Task-Typ (2026-03-25)
- [x] **Shared Data Models** — models.py mit allen Dataclasses (2026-03-25)
- [ ] Gemini API für automatische Bildgenerierung (verschoben)
- [ ] Alle LinkedIn Posts importieren (aktuell nur 38, User liefert mehr)

### Phase 2: Native UI (macOS SwiftUI)
- [ ] Menübar-App (immer erreichbar)
- [ ] Chat-Interface mit geofrey
- [ ] Post-Editor mit Bild-Vorschau
- [ ] 4-Optionen Bild-Auswahl
- [ ] Drag & Drop für Inbox
- [ ] Status-Dashboard (Collections, Chunks, letzte Aktivität)
- [ ] Morning Briefing als native Notification
- [ ] Task Queue Management im UI

### Phase 3: Proaktive Intelligenz
- [ ] Proaktive Vorschläge ("Du hast seit 5 Tagen keinen Post gemacht")
- [ ] Automatisches Re-Indexing wenn sich Dateien ändern
- [ ] Feedback-Loop: User korrigiert → geofrey lernt
- [ ] Gemini API für Bildgenerierung (API Key nötig, gratis Tier verfügbar)
- [ ] Website-Automatisierung (geofrey.ai Content)
- [ ] Multi-Terminal Access: geofrey + Claude Code können andere Sessions prüfen
- [ ] Office Hours / Produkt-Validierung (gstack-inspiriert)

### Phase 4: Erweiterungen
- [ ] Web UI als Alternative zur nativen App
- [ ] LoRA Fine-Tuning wenn MLX Gated DeltaNet unterstützt
- [ ] Multimodal (Bilder/Screenshots indexieren)
- [ ] CRM-Integration
- [ ] E-Mail-Entwürfe
- [ ] Angebots-Generierung mit DACH-Kontext

## RAM-Budget (18GB MacBook Pro M3 Pro)

| Komponente | RAM |
|---|---|
| Qwen3.5-9B (geofrey Brain) | ~5.5 GB |
| nomic-embed-text | ~0.3 GB |
| ChromaDB (~500+ Chunks) | ~0.2 GB |
| Python | ~0.5 GB |
| SwiftUI App | ~0.1 GB |
| macOS + System | ~4 GB |
| **Gesamt** | **~10.6 GB** |
| **Frei** | **~7.4 GB** |
