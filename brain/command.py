"""Command builder — assembles Claude Code CLI commands from structured parts.

Python handles ALL deterministic logic:
- CLI flags (--cwd, --model, --max-turns, --max-budget-usd, --permission-mode)
- Model selection (from config policy)
- Permission mode (plan for read-only tasks, default for execution)

The LLM only generates the -p prompt content.
"""

import shlex
from dataclasses import dataclass
from pathlib import Path


@dataclass
class CommandSpec:
    """Structured specification for a Claude Code command."""

    prompt: str
    project_path: str
    model: str = "opus"
    max_turns: int = 200
    permission_mode: str = "default"


def build_command(spec: CommandSpec) -> str:
    """Build a complete claude CLI command string from a CommandSpec.

    Uses shlex.quote for safe prompt escaping.
    """
    parts = [
        "claude",
        "-p", shlex.quote(spec.prompt),
        "--cwd", shlex.quote(str(Path(spec.project_path).expanduser())),
        "--model", spec.model,
        "--max-turns", str(spec.max_turns),
    ]
    if spec.permission_mode != "default":
        parts.extend(["--permission-mode", spec.permission_mode])
    return " ".join(parts)


def resolve_model(model_category: str, config: dict) -> str:
    """Map model_category (code/analysis/content) to model alias via config."""
    policy = config.get("model_policy", {})
    defaults = {"code": "opus", "analysis": "opus", "content": "sonnet"}
    return policy.get(model_category, defaults.get(model_category, "opus"))


def project_has_code(project_path: str) -> bool:
    """Check if project directory has existing code (not greenfield)."""
    path = Path(project_path).expanduser()
    if not path.exists():
        return False
    indicators = [
        ".git", "package.json", "requirements.txt", "Cargo.toml",
        "go.mod", "pyproject.toml", "Makefile", "setup.py",
    ]
    return any((path / ind).exists() for ind in indicators)
