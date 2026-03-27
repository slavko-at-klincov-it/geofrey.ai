# geofrey Web UI — Dokumentation

## Überblick

Die geofrey Web UI ist eine moderne Single-Page-Applikation, die alle Funktionen des Terminal-CLI in einer grafischen Oberfläche bereitstellt. Sie basiert auf FastAPI (Backend) und Alpine.js + Tailwind CSS (Frontend) — ohne Build-Step, ohne Node.js.

```
geofrey app  →  FastAPI (web/app.py)  →  brain/ + knowledge/ Module
                     ↓
              Alpine.js SPA (web/static/index.html)
              Dark Theme, WebSocket Chat, 6 Views
```

## Schnellstart

```bash
# Dependencies installieren
pip install fastapi uvicorn[standard] websockets

# Web UI starten
python main.py app

# Mit benutzerdefiniertem Port/Host
python main.py app --port 9000 --host 0.0.0.0
```

Öffne danach **http://127.0.0.1:8420** im Browser.

## Voraussetzungen

| Abhängigkeit | Zweck |
|---|---|
| `fastapi` | REST API + WebSocket Backend |
| `uvicorn[standard]` | ASGI Server |
| `websockets` | WebSocket-Unterstützung für Chat |
| Ollama (laufend) | Chat-Antworten + LinkedIn-Generierung |
| ChromaDB | Knowledge Base Abfragen |

> **Hinweis:** Ollama muss lokal laufen (`ollama serve`), damit Chat und LinkedIn-Generierung funktionieren.

## Architektur

### Dateien

```
web/
├── __init__.py          # Package marker
├── app.py               # FastAPI Applikation (alle Endpoints)
└── static/
    └── index.html       # Single-Page App (Alpine.js + Tailwind CSS CDN)
```

### Design-Prinzipien

- **Keine Logik-Duplikation** — alle Endpoints rufen direkt die bestehenden `brain/` und `knowledge/` Module auf
- **Kein Build-Step** — Alpine.js und Tailwind CSS werden via CDN geladen
- **Localhost-only** — kein Auth nötig, da persönliches Tool
- **Single-Worker** — ChromaDB PersistentClient ist nicht thread-safe über Prozesse
- **async via `asyncio.to_thread()`** — blockierende Ollama/ChromaDB-Calls blockieren nicht den Event Loop

## Views

### Dashboard

Die Startseite zeigt eine Übersicht über den aktuellen System-Status:

- **Knowledge Chunks** — Gesamtanzahl aller gespeicherten Chunks
- **Collections** — Anzahl aktiver ChromaDB Collections
- **Pending Tasks** — Offene Tasks in der Queue
- **Collection-Details** — Jede Collection mit Chunk-Anzahl
- **Letzte Tasks** — Die 8 neuesten Tasks mit Status-Badges

### Chat

Direkte Konversation mit geofrey über WebSocket:

- **Task-Erkennung** — geofrey erkennt automatisch den Task-Typ (code-fix, feature, review, etc.)
- **Projekt-Erkennung** — Wenn ein bekanntes Projekt erkannt wird, zeigt geofrey eine Enriched Prompt Preview
- **Streaming** — Antworten werden Token für Token gestreamt (Ollama, Qwen3.5-9B)
- **Kontext-Injektion** — Persönlicher Kontext und RAG-Ergebnisse werden automatisch injiziert
- **Queue-Integration** — Aus einer Enrichment Preview kann direkt ein Task erstellt werden

**Wichtig:** Der Chat führt keine Claude Code Sessions aus. Für Task-Ausführung wird stattdessen die Task Queue verwendet.

### Tasks

Verwaltung der Task Queue:

- **Filter** — Alle / Pending / Running / Done / Failed / Needs Input
- **Task erstellen** — Beschreibung, Projekt (Dropdown), Priorität, Agent-Typ
- **Status-Badges** — Farbcodierte Statusanzeige
- **Details** — Task-ID, Projekt, Priorität, Agent-Typ, Ergebnis/Fehler

### Briefing

Anzeige des Morning Briefings (generiert durch `geofrey overnight`):

- **Erledigt** — Abgeschlossene Tasks mit Zusammenfassung
- **Zur Freigabe** — Tasks mit Code-Änderungen, die Review brauchen
- **Brauche Input** — Tasks, die auf User-Eingabe warten
- **Projekt-Status** — Aggregierte Statistik pro Projekt

### LinkedIn

Post-Generierung über Ollama:

1. Thema eingeben
2. "Generieren" klicken — geofrey nutzt Style Guide, ähnliche Posts und DACH-Kontext
3. Post-Vorschau mit Wortanzahl
4. "Speichern" — sichert in ChromaDB + all_posts.md
5. "Neu generieren" — neuer Entwurf zum gleichen Thema

### Suche

Knowledge Base durchsuchen:

- **Query-Eingabe** — Freitext-Suche
- **Collection-Filter** — Checkboxen für jede verfügbare Collection
- **Ergebnisse** — Collection, Quelle, Relevanz-Score, Text-Preview

## API-Referenz

### REST Endpoints

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/` | SPA ausliefern |
| `GET` | `/api/status` | Knowledge Collections + Chunk-Counts |
| `GET` | `/api/briefing` | Morning Briefing (JSON) |
| `GET` | `/api/tasks?status=` | Tasks auflisten (optional filtern) |
| `POST` | `/api/tasks` | Task erstellen |
| `GET` | `/api/projects` | Projekt-Registry |
| `GET` | `/api/skills` | Verfügbare Routing-Skills |
| `POST` | `/api/search` | Knowledge Base durchsuchen |
| `POST` | `/api/post/generate` | LinkedIn Post generieren |
| `POST` | `/api/post/save` | LinkedIn Post speichern |

### WebSocket

| Pfad | Beschreibung |
|---|---|
| `WS /ws/chat` | Chat mit geofrey |

### Request/Response-Formate

**POST /api/tasks**
```json
{
  "description": "Fix login bug in meus",
  "project": "meus",
  "priority": "high",
  "agent": "coder"
}
```

**POST /api/search**
```json
{
  "query": "DSGVO Anforderungen",
  "collections": ["knowledge", "context_personal"],
  "top_k": 5
}
```

**POST /api/post/generate**
```json
{
  "topic": "NIS2 für KMU"
}
```

**POST /api/post/save**
```json
{
  "text": "Der fertige Post-Text...",
  "topic": "NIS2 für KMU"
}
```

**WebSocket /ws/chat — Client sendet:**
```json
{"message": "Wie funktioniert die Enrichment Engine?"}
```

**WebSocket /ws/chat — Server sendet:**
```json
{"type": "status", "text": "Task-Typ: research"}
{"type": "chunk", "text": "Die Enrichment Engine..."}
{"type": "done"}
```

Mögliche `type`-Werte: `status`, `chunk`, `preview`, `done`, `error`

## Konfiguration

Die Web UI nutzt die bestehende `config/config.yaml`:

- **LLM-Modell** für Chat: `llm.model` (default: `qwen3.5:9b`)
- **Temperatur** für Chat: `orchestrator.temperature` (default: 0.3)
- **Temperatur** für LinkedIn: `linkedin.temperature` (default: 0.7)
- **VectorDB-Pfad**: `paths.vectordb`

### CLI-Optionen

```
python main.py app [--host HOST] [--port PORT]
```

| Option | Default | Beschreibung |
|---|---|---|
| `--host` | `127.0.0.1` | Bind-Adresse (localhost = nur lokal) |
| `--port` | `8420` | Port für den Webserver |

## Technische Details

### Frontend-Stack

- **Alpine.js 3.14** — Reaktivität (`x-data`, `x-show`, `x-model`, `x-for`)
- **Tailwind CSS** — Utility-first Styling via CDN
- **Vanilla WebSocket** — Für Chat-Streaming mit Auto-Reconnect
- **Kein Build-Step** — Alles in einer einzigen HTML-Datei

### Backend-Stack

- **FastAPI** — Async REST + WebSocket
- **uvicorn** — ASGI Server
- **asyncio.to_thread()** — Blockierende Calls (Ollama, ChromaDB) in Thread-Pool
- **StaticFiles** — Statische Dateien ausliefern

### Sicherheit

- **Localhost-only** — Default-Bind an `127.0.0.1`
- **Kein Auth** — Persönliches Tool, keine Authentifizierung nötig
- **Kein Claude Code im Chat** — Chat nutzt lokales Ollama. Task-Ausführung nur via Queue.
- **Single Worker** — Keine Concurrency-Probleme mit ChromaDB

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| "Server nicht erreichbar" | Prüfe ob `python main.py app` läuft |
| Chat antwortet nicht | Prüfe ob Ollama läuft: `ollama serve` |
| Keine Collections im Dashboard | Knowledge Base embedden: `python main.py embed` |
| LinkedIn-Generierung hängt | Ollama muss das Modell `qwen3.5:9b` geladen haben |
| Port belegt | Anderen Port wählen: `python main.py app --port 9000` |
