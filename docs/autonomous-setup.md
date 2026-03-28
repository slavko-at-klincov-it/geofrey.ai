# geofrey — Autonomous Operation Setup (Mac Mini)

> Anleitung für den vollautonomen Betrieb auf einem Mac Mini (oder anderem macOS Rechner).

## Voraussetzungen

### 1. Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
# ODER
brew install anthropic/claude/claude-code
```

Verifizieren:
```bash
which claude
# → /opt/homebrew/bin/claude oder ~/.local/bin/claude
```

### 2. Ollama mit Modellen

```bash
brew install ollama
ollama serve  # Startet den Ollama Server (muss laufen)
ollama pull qwen3.5:9b
ollama pull nomic-embed-text
```

**Ollama als Daemon starten (damit er nach Reboot automatisch läuft):**
```bash
brew services start ollama
```

Verifizieren:
```bash
ollama list
# Muss qwen3.5:9b und nomic-embed-text zeigen
```

### 3. tmux

```bash
brew install tmux
```

### 4. geofrey Python Environment

```bash
cd /pfad/zu/geofrey
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 5. Pre-Flight Check

```bash
python main.py preflight
```

Erwartete Ausgabe:
```
  Pre-flight checks:
    ✓ claude: claude found at /opt/homebrew/bin/claude
    ✓ tmux: tmux found at /opt/homebrew/bin/tmux
    ✓ git: git found at /usr/bin/git
    ✓ ollama_running: Ollama running on localhost:11434
    ✓ ollama_models: Models available: ['qwen3.5:9b', 'nomic-embed-text']
    ✓ directories: 4 directories OK
    All checks passed.
```

Alle 6 Checks müssen ✓ sein bevor der Daemon installiert wird.

## Daemon Installation

### 1. Plist generieren

```bash
python main.py install-daemon > /tmp/ai.geofrey.overnight.plist
cat /tmp/ai.geofrey.overnight.plist  # Prüfen
```

Die generierte Plist enthält:
- **UserName:** Dein macOS Benutzer (damit HOME richtig gesetzt ist)
- **EnvironmentVariables:** PATH mit /opt/homebrew/bin (für claude, ollama, git)
- **WorkingDirectory:** geofrey Projekt-Root
- **Schedule:** 02:00 jede Nacht

### 2. Installieren

```bash
cp /tmp/ai.geofrey.overnight.plist ~/Library/LaunchAgents/ai.geofrey.overnight.plist
launchctl load ~/Library/LaunchAgents/ai.geofrey.overnight.plist
```

### 3. Verifizieren

```bash
launchctl list | grep geofrey
# Sollte "ai.geofrey.overnight" zeigen
```

### 4. Manuell testen (ohne auf 02:00 zu warten)

```bash
python main.py overnight
```

## Mac Mini Spezifisch

### Energieeinstellungen

Der Mac Mini darf um 02:00 nicht schlafen. In Systemeinstellungen:

**System Settings → Energy:**
- "Prevent your Mac from automatically sleeping when the display is off" → **An**
- Oder: "Wake for network access" → **An** (reicht für launchd)

### Auto-Login

Für `LaunchAgents` (User-Level) muss der User eingeloggt sein:
- **System Settings → Users & Groups → Login Options → Automatic login** → Deinen User wählen

Alternative: LaunchDaemons (System-Level) — braucht Root, komplexer.

### RAM Budget (18GB M3 Pro)

| Prozess | RAM | Wann |
|---------|-----|------|
| Ollama (qwen3.5:9b) | ~6 GB | Immer (Server läuft) |
| Claude Code CLI | ~200 MB | Pro Session |
| ChromaDB | ~100 MB | Bei Queries |
| geofrey Python | ~50 MB | Daemon-Lauf |
| **Gesamt** | **~6.5 GB** | Passt locker in 18GB |

## Täglicher Betrieb

### Tasks queuen (tagsüber)

```bash
geofrey queue add "refactor auth module" --project meus --priority high
geofrey queue add "update docs" --project geofrey --priority normal
geofrey queue list
```

### Morning Briefing (morgens)

```bash
geofrey briefing
```

### Session Learnings extrahieren

```bash
geofrey learn --project geofrey
geofrey learnings geofrey
```

### Decision Management

```bash
geofrey decisions list
geofrey decisions check "switch to postgres" --project meus
```

## Troubleshooting

### Logs prüfen

```bash
tail -f ~/.knowledge/geofrey-overnight.log
```

### Häufige Probleme

| Problem | Ursache | Lösung |
|---------|---------|--------|
| "claude CLI not found" | PATH nicht gesetzt in launchd | Plist neu generieren: `python main.py install-daemon` |
| "Ollama not responding" | Ollama Server nicht gestartet | `brew services start ollama` |
| "Missing models" | Modelle nicht gepullt | `ollama pull qwen3.5:9b && ollama pull nomic-embed-text` |
| Leeres Briefing | Tasks in falscher DB (HOME falsch) | Prüfe UserName + HOME in Plist |
| Daemon läuft nicht um 02:00 | Mac schläft | Energieeinstellungen prüfen |
| "Permission denied" | ~/.knowledge nicht schreibbar | `chmod 755 ~/.knowledge` |

### Pre-Flight erneut prüfen

```bash
python main.py preflight
```

Zeigt alle Checks mit Status. Fix die fehlenden, dann Daemon neu laden:

```bash
launchctl unload ~/Library/LaunchAgents/ai.geofrey.overnight.plist
python main.py install-daemon > ~/Library/LaunchAgents/ai.geofrey.overnight.plist
launchctl load ~/Library/LaunchAgents/ai.geofrey.overnight.plist
```
