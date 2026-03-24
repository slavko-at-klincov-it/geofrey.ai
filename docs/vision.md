# geofrey — Vision & Roadmap

## Die Vision

geofrey ist Slavkos persönlicher AI-Assistent der lokal auf seinem Mac läuft. Er ist die intelligente Schicht zwischen Mensch und Claude Code. geofrey weiß wer Slavko ist, kennt seinen Markt (DACH), seine Projekte, seinen Schreibstil, und versteht Claude Code in- und auswendig.

geofrey ist kein Chatbot. geofrey ist ein Orchestrator der die richtigen Tools zur richtigen Zeit mit dem richtigen Kontext einsetzt.

## Kern-Prinzipien

1. **Local-First:** Alles läuft lokal. Keine Cloud-Abhängigkeit für die Kernfunktionen. Claude Code und Gemini sind externe Tools die geofrey aufruft, aber geofrey selbst braucht kein Internet.
2. **Stetig lernend:** Jede Interaktion macht geofrey schlauer. Recherche-Ergebnisse, bestätigte Posts, Session-Daten — alles fließt automatisch in die Wissensbasis.
3. **DACH-Kontext immer:** Slavko arbeitet im deutschsprachigen Raum. DSGVO, NIS2, EU Data Boundary, österreichisches Recht — das muss in jede Antwort einfließen, ohne dass man es jedes Mal sagen muss.
4. **Claude Code Experte:** geofrey weiß wie man Claude Code optimal nutzt — Modellwahl, Flags, Permissions, Skills, Hooks. Der User muss kein Claude Code Experte sein.

## Use Cases

### 1. LinkedIn Post Pipeline (Priorität 1)
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

### 2. Recherche mit Wissens-Persistenz
```
User: "Recherchier die NIS2 Änderungen für 2026"
  → geofrey → Claude Code (Opus): tiefe Recherche
  → Ergebnis wird zusammengefasst
  → Zusammenfassung landet automatisch im Knowledge Hub
  → Beim nächsten Mal weiß geofrey schon Bescheid
```

### 3. Coding / Projekt-Arbeit
```
User: "Fix den Login-Bug in Meus"
  → geofrey kennt Meus (React Native, Expo, ~/Code/Meus)
  → geofrey generiert: claude -p "..." --cwd ~/Code/Meus --model sonnet
  → User bestätigt, Claude Code arbeitet
```

### 4. Geschäftsdokumente
```
User: "Schreib ein Angebot für Kunde X, Power Platform Beratung"
  → geofrey kennt DACH-Markt, Preise, Steuern
  → geofrey nutzt Claude Code für den Entwurf
  → DSGVO-konformes Angebot mit österreichischem Kontext
```

## Phasen

### Phase 1: Core (Terminal-basiert)
- [x] Knowledge Hub mit 6 Collections (gebaut 2026-03-24)
- [x] DACH-Kontext Injection (gebaut 2026-03-24)
- [x] Orchestrator-Logik (brain/) (gebaut 2026-03-22/23, migriert 2026-03-24)
- [x] LinkedIn Post Ingestion + Style Guide (gebaut 2026-03-24)
- [x] Session/Inbox Pipeline (gebaut 2026-03-24)
- [x] Code-Migration von CLI_Maestro + knowledge-assistant nach geofrey (2026-03-24)
- [x] LinkedIn Post-Generierung End-to-End: `python main.py post "Thema"` (2026-03-24)
- [x] Bild-Prompt Generierung via Claude Code Sonnet — 4 Optionen (2026-03-24)
- [ ] Gemini API-Anbindung für automatische Bildgenerierung (verschoben)
- [x] Session Intelligence: Learnings aus Claude Code Sessions extrahieren (2026-03-24)
- [ ] Alle LinkedIn Posts importieren (aktuell nur 38, User liefert mehr)

### Phase 2: Native UI (macOS SwiftUI)
- [ ] Menübar-App (immer erreichbar)
- [ ] Chat-Interface mit geofrey
- [ ] Post-Editor mit Bild-Vorschau
- [ ] 4-Optionen Bild-Auswahl
- [ ] Drag & Drop für Inbox
- [ ] Status-Dashboard (Collections, Chunks, letzte Aktivität)

### Phase 3: Autonomie
- [ ] geofrey entscheidet selbst welches Claude Code Modell (Haiku/Sonnet/Opus)
- [ ] Automatisches Re-Indexing wenn sich Dateien ändern
- [ ] Feedback-Loop: User korrigiert → geofrey lernt
- [ ] Proaktive Vorschläge ("Du hast seit 5 Tagen keinen Post gemacht")

### Phase 4: Erweiterungen
- [ ] Gemini API für Bildgenerierung (API Key nötig, gratis Tier verfügbar)
- [ ] Web UI als Alternative zur nativen App
- [ ] LoRA Fine-Tuning wenn MLX Gated DeltaNet unterstützt
- [ ] Multimodal (Bilder/Screenshots indexieren)
- [ ] CRM-Integration
- [ ] E-Mail-Entwürfe
- [ ] Angebots-Generierung mit DACH-Kontext
- [ ] E-Mail-Entwürfe

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
