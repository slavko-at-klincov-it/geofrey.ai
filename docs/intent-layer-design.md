# geofrey — LLM Intent Layer: Wiederherstellung + Design

> Dokumentiert am 2026-03-28. Status: Design abgeschlossen, Implementierung beginnt.

## Was passiert ist

Der Orchestrator hatte ursprünglich eine LLM-Schicht für Intent-Verständnis. Das Template `brain/templates/orchestrator.md` existiert noch — es sagt dem LLM: "Write a DETAILED PROMPT for Claude Code" und "If the request is ambiguous, ask ONE short clarifying question."

Während der Python-First Architecture Session (2026-03-25) wurde die LLM-Schicht entfernt. Das Ziel war korrekt: deterministische CLI-Konstruktion. Aber Intent-Verständnis ist NICHT deterministisch — es wurde als Kollateralschaden mit entfernt.

Das Ergebnis: Ein statischer Keyword-Router der "die Login-Seite geht nicht mehr" nicht versteht.

## Architektur — Neuer Flow

```
User Input
  │
  ▼
┌─────────────────────────────────────┐
│  LLM INTENT LAYER (Qwen3.5-9B)     │  NEU
│                                     │
│  Input: User-Text + Projekt-Liste   │
│  Output: {                          │
│    "task_type": "code-fix",         │
│    "project": "webshop",            │
│    "summary": "Login-Bug fixen",    │
│    "clarification": null,           │
│    "subtasks": [],                  │
│    "relevant_files": ["auth.py"]    │
│  }                                  │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  PYTHON ENRICHMENT (deterministisch)│  BLEIBT
│                                     │
│  gather_project_context()           │
│  check_decision_conflicts()         │
│  _build_enriched_prompt()           │
│  validate_prompt()                  │
│  build_command()                    │
└──────────┬──────────────────────────┘
           │
           ▼
  Claude Code CLI (Execution)
```

## Was das LLM macht (und Python NICHT kann)

| Fähigkeit | Keyword-Router | LLM Intent |
|-----------|---------------|------------|
| "fix the login bug" | ✓ (fix+bug) | ✓ |
| "die Login-Seite geht nicht mehr" | ✗ (kein Keyword) | ✓ versteht natürliche Sprache |
| "schau dir mal auth an" | ✗ (ambig: review? fix?) | ✓ kann nachfragen |
| "jetzt auch registration fixen" | ✗ (kein Follow-up) | ✓ versteht "auch" + "jetzt" |
| "erst recherchieren, dann bauen" | ✗ (1 Task-Type) | ✓ dekomponiert in 2 Tasks |
| 50 geänderte Dateien | alle dumpen | nur relevante filtern |

## Was das LLM NICHT macht

- Keine CLI-Flags bauen (Python: command.py)
- Keine Modell-Auswahl (Python: resolve_model())
- Keinen Prompt zusammenbauen (Python: enricher.py)
- Keine Safety-Checks (Python: gates.py)
- Keine Decisions laden (Python: decision_checker.py)

## LLM Output-Schema

```json
{
  "task_type": "code-fix|feature|refactor|review|research|security|doc-sync",
  "project": "webshop",
  "summary": "Kurze Zusammenfassung was der User will",
  "clarification": "Meinst du die Login-Seite oder die API-Auth?" | null,
  "subtasks": ["recherchieren", "implementieren"] | [],
  "relevant_files": ["src/auth.py", "src/login.py"] | [],
  "approach": "Root Cause analysieren, nicht nur Symptome patchen" | null
}
```

## Fallback

Wenn Ollama nicht läuft → Keyword-Router als Fallback (router.py bleibt). System degradiert zu aktuellem Verhalten, crasht nicht.

## Integration in bestehenden Code

### brain/intent.py (NEU)

Neue Datei. Ruft Qwen3.5 auf, parsed JSON-Response, gibt strukturierten Intent zurück.

### brain/orchestrator.py (GEÄNDERT)

`_run_enrichment_flow()` ruft zuerst `understand_intent()` auf. Bei `clarification != null` fragt der Orchestrator den User. Dann weiter mit Python-Enrichment.

### brain/templates/intent.md (NEU)

System-Prompt für Qwen3.5 der den Intent-Output als JSON definiert.
