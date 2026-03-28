# Agent-Diskussion Findings — Kritische Lücken im Projekt

> Entstanden aus einer Diskussion zwischen zwei spezialisierten Agents (Critical Reviewer + Project Advocate) die das gesamte Projekt Use-Case-basiert durchgegangen sind. Datum: 2026-03-28.

## Finding 1: Guardian/Observer/Review sind DEAD CODE im Interactive Mode

**Schwere:** KRITISCH

Drei Module wurden gebaut, funktionieren, sind getestet — aber im Interactive-Path (`geofrey chat`, `geofrey task`) nie aufgerufen:
- `monitor.py` (Guardian) → 0 Call-Sites im gesamten Projekt
- `observer.py` (Output-Triage) → nur in Daemon-Path (post_process)
- `review.py` (Quality Review) → 0 Call-Sites

Der User nutzt Interactive — bekommt die schlechtere Erfahrung. Der Daemon hat Observer + Learning Extraction automatisch, der Interactive-Path nicht.

**Betrifft:** brain/orchestrator.py muss monitor_session(), observer, und automatische Learning Extraction integrieren.

---

## Finding 2: Timing-Problem beim Guardian Monitor

**Schwere:** HOCH

Monitor pollt `capture_session_output()` alle 10 Sekunden. Claude Code kann in 2-3 Sekunden Änderungen committen. Wenn Claude bei Sekunde 2 einen problematischen Vorschlag macht und bei Sekunde 5 committet, sieht der Guardian es erst bei Sekunde 10 — zu spät.

Zusätzlich: Claude's Output scrollt im tmux Pane. `capture_session_output()` liest die letzten 200 Zeilen. Bei schnellen Aktionen könnte der Vorschlag-Text bereits durchgescrollt sein.

**Betrifft:** brain/monitor.py poll_interval, brain/session.py capture Reichweite.

---

## Finding 3: Kein Timeout auf Claude Code Sessions

**Schwere:** HOCH

`run_session_sync()` in session.py ruft `subprocess.run()` OHNE Timeout auf. Eine hängende Claude Code Session blockiert:
- Im Daemon: den gesamten Overnight-Queue (alle nachfolgenden Tasks werden nie verarbeitet)
- Im Interactive: das Terminal des Users (Ctrl+C ist der einzige Ausweg)

`monitor_session()` hat `max_wait=600` aber wird nie aufgerufen (Finding 1).

**Betrifft:** brain/session.py run_session_sync(), brain/agents/base.py execute().

---

## Finding 4: Orphaned RUNNING Tasks nach Daemon-Crash

**Schwere:** MITTEL

Wenn der Daemon crasht während ein Task auf RUNNING steht:
- Task bleibt für immer im Status RUNNING
- `get_pending_tasks()` sucht nur `status='pending'`
- Der Task wird nie wieder aufgegriffen, nie als FAILED markiert
- Kein Timeout-basierter Recovery-Mechanismus

**Betrifft:** brain/queue.py, brain/daemon.py.

---

## Finding 5: Neues Projekt erstellen unmöglich

**Schwere:** MITTEL

"erstell ein neues projekt mobile-app" → Intent erkennt es als Feature → Projekt nicht in projects.yaml → "No project detected" → Task abgebrochen.

Kein `geofrey add-project` Command. Kein Projekt-Erstellungs-Workflow. Kein GitHub-Repo-Setup. User muss manuell YAML editieren.

**Betrifft:** main.py, brain/orchestrator.py, config/projects.yaml.

---

## Finding 6: Session JSONL Zuordnung unsicher

**Schwere:** MITTEL

`post_process()` nimmt `jsonls[0]` (neueste Datei nach mtime) ohne zu prüfen ob sie zur gerade gelaufenen Session gehört. Szenarien wo das bricht:
- Zwei Claude Code Sessions laufen parallel auf dem gleichen Projekt
- User öffnet manuell eine Claude Code Session während geofrey's Overnight-Daemon läuft
- Dateisystem-Timestamp-Auflösung (HFS+ = 1s) bei schnell aufeinanderfolgenden Sessions

**Betrifft:** brain/agents/base.py post_process().

---

## Finding 7: Große Sessions → Stundenlange LLM-Verarbeitung

**Schwere:** MITTEL

50MB JSONL → ~2000 Chunks × 5s Qwen3.5 pro Chunk = 10.000 Sekunden (2.8 Stunden). Die Map-Phase (`extract_learnings_chunk()`) hat kein Limit auf Chunk-Anzahl. Bei 10 Sessions pro Nacht: theoretisch 28 Stunden Verarbeitungszeit.

**Betrifft:** knowledge/intelligence.py extract_session(), chunk_conversation().

---

## Finding 8: Decisions akkumulieren unbegrenzt

**Schwere:** NIEDRIG (aktuell), HOCH (in 6 Monaten)

- `load_decisions_from_files()` liest ALLE Markdown-Files bei jeder Enrichment
- Kein Caching, kein Staleness-Check, kein Archiv
- Nach 6 Monaten (~360 Decisions): 4× voller Disk-Scan pro Task
- Kein `valid_until` Feld, kein automatisches Deprecating
- Veraltete Decisions erzeugen Noise der Claude's Leistung verschlechtert

**Betrifft:** knowledge/decisions.py, brain/decision_checker.py.

---

## Finding 9: Decision System kann sich nicht selbst schützen

**Schwere:** NIEDRIG

DEC-001 bis DEC-006 schützen konkrete Entscheidungen. Aber es gibt keine Meta-Decision die sagt: "Lösche nicht das Decision System selbst." Wenn Claude vorschlägt das Decision System zu entfernen, gibt es keine Decision die das verhindert.

**Betrifft:** knowledge-base/decisions/geofrey/ — fehlendes DEC-007.

---

## Finding 10: Post-Actions sind Wünsche, keine Enforcement

**Schwere:** NIEDRIG

"Run existing tests to verify the fix" steht als Textzeile im Prompt unter "## Requirements". Aber:
- Niemand prüft ob Claude die Tests tatsächlich ausgeführt hat
- Kein programmatischer Verify-Schritt
- Die Review-Fragen (review.py) fragen danach — aber nur wenn der Review-Loop aktiv ist (Finding 1)

**Betrifft:** brain/enricher.py, brain/review.py (wenn angebunden).

---

## Positive Findings (von Project Advocate)

| Stärke | Status |
|--------|--------|
| Enrichment Pipeline (17→14.436 chars) | Production-ready, 150 Tests |
| Decision Dependency System | Weltweit einzigartig — kein anderes Tool hat Dependencies + Semantic Search + Auto-Extraction |
| LLM/Python Trennung | Graceful Degradation: Ollama down → Keyword Fallback funktioniert |
| Safety Gates (BLOCK/WARN) | Getestet, nuanciert (rm -rf /tmp ≠ rm -rf /) |
| Guardian Architektur | Konzept ist korrekt — nur nicht angebunden |
| Test-Abdeckung | ~5000 Zeilen Tests, 50 Acceptance, 100 Live LLM Tests |
| Session Intelligence | Map-Reduce Pipeline extrahiert strukturierte Learnings |
| Closed Learning Loop | Fast geschlossen — nur manueller `learn` Trigger fehlt |
