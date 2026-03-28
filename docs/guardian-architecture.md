# geofrey als Guardian — Architektur für aktive Projektüberwachung

> Dokumentiert am 2026-03-28. Entstanden aus User-Feedback über 1.999 Nachrichten in 29 Projekten.

## Das Problem

Der User vertraut Claude Code's Vorschlägen. Claude schlägt Änderungen vor auf Basis von unvollständigem Verständnis. Der User sagt "ja". Claude baut etwas das vom Plan abweicht. Der User merkt es erst später — manchmal erst am Bauchgefühl.

**Beobachtet über 1.999 Nachrichten:**
- 35% aller Nachrichten sind Korrekturen (User holt Claude zurück auf Kurs)
- 45% sind Bestätigungen ("ok", "ja") — User vertraut Claude's Vorschlägen
- Die Kombination ist toxisch: hohes Vertrauen + häufige Korrekturen = Claude driftet unbemerkt ab

## Die Lösung: geofrey als Guardian

```
Claude Code arbeitet (tmux Session)
         │
    geofrey Monitor liest Claude's Output mit:
         │
         ├── Claude schlägt vor: "Ich verschiebe auth in neues Modul"
         │
         ▼
    PYTHON PRÜFT (deterministisch, kein LLM):
    ├── Decision Check: DEC-WS-002 sagt "auth.py ist Single Source"
    ├── Vision Check: "Keine neuen Module ohne Plan"
    ├── Pattern Check: Erkennt "verschieben/umbauen/neu erstellen" Signalwörter
         │
         ▼
    ┌─────────────────────────────────────────────────┐
    │  ⚠ geofrey warnt den User:                      │
    │  "Claude will auth in neues Modul verschieben.   │
    │   DEC-WS-002 sagt: auth.py ist Single Source.    │
    │   Willst du das wirklich?"                       │
    │                                                  │
    │  [y] Ja, trotzdem  [n] Nein, stopp  [?] Erklär  │
    └─────────────────────────────────────────────────┘
         │
         ▼
    User entscheidet INFORMIERT (nicht blind)
```

## Was geofrey prüft (während Claude arbeitet)

### Ebene 1: Decision-Konflikte (deterministisch)

Claude's Output wird auf Signalwörter gescannt die auf strukturelle Änderungen hindeuten:

```python
PROPOSAL_SIGNALS = [
    "I'll move", "I'll restructure", "I'll replace", "I'll remove",
    "I'll create a new", "I'll refactor", "I'll change the",
    "verschiebe", "ersetze", "entferne", "erstelle neu",
    "restructure", "migrate", "replace with", "switch to",
]
```

Wenn ein Signal erkannt wird → `query_decisions_by_scope()` mit den betroffenen Dateien → Wenn Decision-Konflikt: WARNUNG an User.

### Ebene 2: Scope-Überwachung (deterministisch)

Wenn Claude Dateien erstellt oder löscht die in einer Decision's `scope` stehen → WARNUNG.

```python
# Claude's Output enthält: "Created file: brain/safety.py"
# DEC-001 sagt: "Do NOT recreate safety.py"
# → WARNUNG: "Claude hat safety.py erstellt. DEC-001 sagt: nicht erstellen."
```

### Ebene 3: Drift-Erkennung (deterministisch)

Wenn Claude mehr als N Dateien ändert die NICHT in der ursprünglichen Aufgabe erwähnt wurden → WARNUNG:
```
Aufgabe: "fix login bug"
Claude ändert: auth.py, cart.py, app.py, middleware.py, config.yaml
→ WARNUNG: "5 Dateien geändert für einen Login-Bug. Erwartet: 1-2. Stimmt das?"
```

## Technische Umsetzung

### monitor.py erweitern

Der bestehende Monitor pollt `capture_session_output()` alle 10s. Zusätzlich:

1. **Proposal Detection:** Jeder neue Output-Block wird auf PROPOSAL_SIGNALS gescannt
2. **Decision Matching:** Erkannte Vorschläge → `check_decision_conflicts()` mit extrahierten Dateinamen
3. **Scope Drift:** Zähle geänderte/erstellte Dateien, vergleiche mit Task-Scope
4. **User Warning:** Bei Konflikt → Output pausieren, User warnen, Entscheidung abwarten

### Neue Funktionen

```python
# In brain/monitor.py:

def _detect_proposals(output: str, last_checked: str) -> list[str]:
    """Detect structural change proposals in Claude's output."""

def _check_proposal_against_decisions(
    proposal: str, project_name: str, project_path: str, config: dict
) -> list[str]:
    """Check if a proposal conflicts with active decisions."""

def _check_scope_drift(
    changed_files: list[str], original_task: str, threshold: int = 3
) -> str | None:
    """Warn if too many files changed for the task scope."""
```

## Warum das funktioniert

1. **Python prüft, nicht LLM** — deterministisch, zuverlässig, kein Halluzinations-Risiko
2. **Decisions sind die Quelle** — was bewusst entschieden wurde, ist dokumentiert
3. **User entscheidet informiert** — sieht die Warnung BEVOR er "ja" sagt
4. **Kein Overhead wenn alles OK** — nur bei erkanntem Konflikt wird gewarnt
5. **Funktioniert auch nachts** — Overnight-Mode: Decision-Konflikte → Task als NEEDS_INPUT markieren statt blindes Weitermachen

## Beziehung zu anderen Systemen

- **Decision System (DEC-001 bis DEC-006):** Liefert die Wissensbasis gegen die geprüft wird
- **Session Intelligence:** Extrahierte Learnings fließen in zukünftige Prüfungen
- **Quality Review (brain/review.py):** Prüft AM ENDE, Guardian prüft WÄHREND der Arbeit
- **Observer (brain/observer.py):** Triagiert das Ergebnis, Guardian überwacht den Prozess
