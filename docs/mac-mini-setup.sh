#!/bin/bash
# ============================================================
# geofrey Mac Mini M4 Setup
# Einmal ausfuehren auf dem Mac Mini, dann laeuft alles.
# ============================================================

set -e

echo "=== 1/8: Homebrew + Grundtools ==="
if ! command -v brew &>/dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi
brew install python@3.12 git tmux

echo "=== 2/8: Claude Code CLI ==="
if ! command -v claude &>/dev/null; then
    echo "Claude Code CLI installieren:"
    echo "  npm install -g @anthropic-ai/claude-code"
    echo "  (oder: brew install claude-code)"
    echo ""
    echo "Danach einmalig: claude login"
    echo "Druecke Enter wenn claude installiert und eingeloggt ist..."
    read -r
fi

echo "=== 3/8: Ollama ==="
brew install ollama
brew services start ollama
# Warten bis Ollama laeuft
sleep 3
ollama pull nomic-embed-text
echo "Ollama laeuft als Service (startet automatisch nach Reboot)."

echo "=== 4/8: geofrey klonen + venv ==="
mkdir -p ~/Code
cd ~/Code

if [ ! -d "geofrey" ]; then
    git clone git@github.com:slavko-at-klincov-it/geofrey.ai.git geofrey
fi

cd geofrey
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "=== 5/8: Playwright (fuer Akquise-Crawler) ==="
.venv/bin/pip install playwright
.venv/bin/playwright install chromium

echo "=== 6/8: Tailscale (Remote-Zugriff vom MacBook) ==="
if ! command -v tailscale &>/dev/null; then
    brew install --cask tailscale
    echo "Tailscale installiert. Bitte oeffne Tailscale aus Applications"
    echo "und logge dich mit deinem Account ein."
    echo "Auf dem MacBook auch Tailscale installieren + gleicher Account."
    echo "Druecke Enter wenn Tailscale laeuft..."
    read -r
fi

echo "=== 7/8: geofrey Preflight + Test ==="
cd ~/Code/geofrey

# Preflight
echo "--- Preflight ---"
.venv/bin/python main.py preflight

# Kurzer Test: Helferlein laufen lassen
echo ""
echo "--- Helferlein Testlauf ---"
.venv/bin/python -c "
from knowledge.store import load_config
from brain.helferlein import run_all_helferlein
from brain.helferlein.content import ContentHelferlein
from brain.helferlein.projekt import ProjektHelferlein
from brain.helferlein.admin import AdminHelferlein
from brain.helferlein.akquise import AkquiseHelferlein
config = load_config()
total = run_all_helferlein(config)
print(f'Helferlein: {total} Proposals erstellt')
"

echo ""
echo "--- Dashboard starten (Test) ---"
echo "Dashboard wird auf http://0.0.0.0:8000 gestartet..."
echo "Vom MacBook erreichbar via: http://<mac-mini-tailscale-name>:8000"
echo "Ctrl+C zum Beenden."
.venv/bin/python main.py web --host 0.0.0.0 --port 8000

echo "=== 8/8: Energy Settings ==="
echo ""
echo "WICHTIG: Manuell in System Settings einstellen:"
echo "  System Settings > Energy > 'Prevent automatic sleeping when display is off' = ON"
echo "  Sonst feuert der Overnight Daemon um 02:00 nicht."
echo ""
echo "=== Setup fertig ==="
