"""Diff scope detection — categorize changed files into scopes.

Inspired by gstack's diff-scope utility. Helps the orchestrator generate
more targeted Claude Code commands by understanding what kind of changes
are pending in a project.
"""

import subprocess
from pathlib import Path

# Scope definitions: name -> patterns (checked in file path)
SCOPES: dict[str, list[str]] = {
    "frontend": [
        ".tsx", ".jsx", ".css", ".scss", ".html", ".svg",
        "components/", "screens/", "pages/", "ui/", "styles/",
    ],
    "backend": [
        ".py", ".go", ".rs", ".java", ".rb",
        "api/", "server/", "brain/", "knowledge/",
    ],
    "tests": [
        "test_", "_test.", ".test.", ".spec.",
        "tests/", "__tests__/", "e2e/",
    ],
    "docs": [
        ".md", ".rst", ".txt",
        "docs/", "README", "CHANGELOG",
    ],
    "config": [
        ".yaml", ".yml", ".json", ".toml", ".env",
        "config/", ".claude/", "Dockerfile", "docker-compose",
    ],
    "scripts": [
        ".sh", ".bash",
        "scripts/", "Makefile",
    ],
}


def detect_scope(file_path: str) -> str:
    """Determine scope of a single file path.

    Tests take priority (a test file in backend/ is still 'tests').
    Returns one of: frontend, backend, tests, docs, config, scripts.
    """
    path_lower = file_path.lower()

    # Tests first (highest priority)
    for pattern in SCOPES["tests"]:
        if pattern in path_lower:
            return "tests"

    # Then check other scopes (order matters for ambiguity)
    for scope in ("frontend", "config", "scripts", "docs", "backend"):
        for pattern in SCOPES[scope]:
            if pattern in path_lower:
                return scope

    return "backend"  # default


def detect_diff_scopes(project_path: str) -> dict[str, list[str]]:
    """Run git diff on a project and categorize changed files by scope.

    Returns dict of scope -> list of changed file paths.
    Includes both staged and unstaged changes.
    """
    try:
        # Get both staged and unstaged changes
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            capture_output=True, text=True, cwd=project_path, timeout=10,
        )
        files = set()
        if result.returncode == 0 and result.stdout.strip():
            files.update(f.strip() for f in result.stdout.strip().split("\n") if f.strip())

        # Also get untracked files
        result2 = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            capture_output=True, text=True, cwd=project_path, timeout=10,
        )
        if result2.returncode == 0 and result2.stdout.strip():
            files.update(f.strip() for f in result2.stdout.strip().split("\n") if f.strip())

    except (subprocess.TimeoutExpired, FileNotFoundError):
        return {}

    scopes: dict[str, list[str]] = {}
    for f in sorted(files):
        scope = detect_scope(f)
        scopes.setdefault(scope, []).append(f)

    return scopes


def scope_summary(scopes: dict[str, list[str]]) -> str:
    """One-line summary of scope distribution for the orchestrator prompt."""
    if not scopes:
        return ""
    parts = [f"{scope}: {len(files)} files" for scope, files in sorted(scopes.items())]
    return "Pending changes: " + ", ".join(parts)
