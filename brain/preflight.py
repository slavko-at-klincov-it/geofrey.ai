"""Pre-flight checks — validate runtime dependencies before daemon execution.

Checks: Claude CLI, tmux, Ollama server, Ollama models, writable directories,
git. Each check returns (passed, message). run_preflight() runs all and returns
a summary dict.
"""

import os
import shutil
import subprocess
from pathlib import Path


def check_claude_available() -> tuple[bool, str]:
    """Check if claude CLI is in PATH."""
    path = shutil.which("claude")
    if path:
        return True, f"claude found at {path}"
    return False, "claude CLI not found in PATH. Install: npm install -g @anthropic-ai/claude-code"


def check_tmux_available() -> tuple[bool, str]:
    """Check if tmux is installed."""
    path = shutil.which("tmux")
    if path:
        return True, f"tmux found at {path}"
    return False, "tmux not found. Install: brew install tmux"


def check_git_available() -> tuple[bool, str]:
    """Check if git is installed."""
    path = shutil.which("git")
    if path:
        return True, f"git found at {path}"
    return False, "git not found."


def check_ollama_running() -> tuple[bool, str]:
    """Check if Ollama daemon is responding."""
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:11434/api/tags"],
            capture_output=True, text=True, timeout=3,
        )
        if result.stdout.strip() == "200":
            return True, "Ollama running on localhost:11434"
        return False, f"Ollama not responding (HTTP {result.stdout.strip()}). Start: ollama serve"
    except subprocess.TimeoutExpired:
        return False, "Ollama not responding (timeout). Start: ollama serve"
    except FileNotFoundError:
        return False, "curl not found — cannot check Ollama status"


def check_ollama_models(config: dict) -> tuple[bool, str]:
    """Check if required Ollama models are pulled."""
    required = [config.get("llm", {}).get("model", "qwen3.5:9b"),
                config.get("embedding", {}).get("model", "nomic-embed-text")]
    try:
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return False, "ollama list failed"
        available = result.stdout.lower()
        missing = [m for m in required if m.split(":")[0].lower() not in available]
        if missing:
            cmds = " && ".join(f"ollama pull {m}" for m in missing)
            return False, f"Missing models: {missing}. Pull: {cmds}"
        return True, f"Models available: {required}"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False, "ollama not found or not responding"


def check_directories_writable(config: dict) -> tuple[bool, str]:
    """Check if all required directories exist and are writable."""
    dirs = [
        Path.home() / ".knowledge",
        Path.home() / ".knowledge" / "vectordb",
    ]
    # Add configured paths
    for key in ["session_learnings", "decisions"]:
        path_str = config.get("paths", {}).get(key, "")
        if path_str:
            p = Path(os.path.expanduser(path_str))
            if not p.is_absolute():
                p = Path(__file__).parent.parent / p
            dirs.append(p)

    problems = []
    for d in dirs:
        try:
            d.mkdir(parents=True, exist_ok=True)
            if not os.access(d, os.W_OK):
                problems.append(f"{d} not writable")
        except OSError as e:
            problems.append(f"{d}: {e}")

    if problems:
        return False, f"Directory problems: {'; '.join(problems)}"
    return True, f"{len(dirs)} directories OK"


def run_preflight(config: dict) -> dict[str, tuple[bool, str]]:
    """Run all pre-flight checks.

    Returns dict of {check_name: (passed, message)}.
    """
    return {
        "claude": check_claude_available(),
        "tmux": check_tmux_available(),
        "git": check_git_available(),
        "ollama_running": check_ollama_running(),
        "ollama_models": check_ollama_models(config),
        "directories": check_directories_writable(config),
    }


def format_preflight(results: dict[str, tuple[bool, str]]) -> str:
    """Format pre-flight results for terminal display."""
    lines = ["  Pre-flight checks:"]
    for name, (passed, msg) in results.items():
        icon = "✓" if passed else "✗"
        lines.append(f"    {icon} {name}: {msg}")

    all_passed = all(ok for ok, _ in results.values())
    critical_failed = not results["claude"][0] or not results["directories"][0]

    if all_passed:
        lines.append("    All checks passed.")
    elif critical_failed:
        lines.append("    CRITICAL: Cannot proceed without claude CLI and writable directories.")
    else:
        lines.append("    Some checks failed — system will run in degraded mode.")

    return "\n".join(lines)
