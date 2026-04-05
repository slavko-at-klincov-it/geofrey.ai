"""Projekt-Helferlein -- health checks for all registered projects.

Runs overnight to check:
- Test suite status (runs pytest/npm test)
- Git status (uncommitted changes)
- Documentation existence (CLAUDE.md, README.md)

Creates proposals for issues found, with prepared Claude Code CLI
prompts for fixes.
"""

import logging
import subprocess
from pathlib import Path

from brain.helferlein import register
from brain.proposals import create_proposal, has_pending_proposal

logger = logging.getLogger("geofrey.helferlein.projekt")

# Test commands per stack
TEST_COMMANDS = {
    "python": [".venv/bin/python", "-m", "pytest", "-x", "-q", "--tb=short"],
    "node": ["npm", "test", "--", "--watchAll=false"],
}


def _detect_stack(project_path: Path) -> str | None:
    """Detect project stack from files present."""
    if (project_path / "pyproject.toml").exists() or (project_path / "requirements.txt").exists():
        return "python"
    if (project_path / "package.json").exists():
        return "node"
    return None


def _run_tests(project_path: Path, stack: str) -> tuple[bool, str]:
    """Run tests for a project. Returns (success, output)."""
    cmd = TEST_COMMANDS.get(stack)
    if not cmd:
        return True, "No test command for stack"

    # Check if test infrastructure exists
    if stack == "python":
        venv = project_path / ".venv"
        tests_dir = project_path / "tests"
        if not venv.exists() or not tests_dir.exists():
            return True, "No venv or tests directory"
    elif stack == "node":
        node_modules = project_path / "node_modules"
        if not node_modules.exists():
            return True, "No node_modules"

    try:
        result = subprocess.run(
            cmd,
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=300,  # 5 min max per project
        )
        output = result.stdout[-1000:] + result.stderr[-500:]
        return result.returncode == 0, output.strip()
    except subprocess.TimeoutExpired:
        return False, "Tests timed out after 5 minutes"
    except Exception as e:
        return False, str(e)


def _check_git_status(project_path: Path) -> tuple[bool, str]:
    """Check for uncommitted changes."""
    if not (project_path / ".git").exists():
        return True, "Not a git repository"

    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        changes = result.stdout.strip()
        if not changes:
            return True, "Clean"

        lines = changes.splitlines()
        return False, f"{len(lines)} uncommitted change(s):\n{changes[:500]}"
    except Exception as e:
        return False, str(e)


def _check_docs(project_path: Path) -> list[str]:
    """Check for missing documentation files."""
    missing = []
    if not (project_path / "CLAUDE.md").exists():
        missing.append("CLAUDE.md")
    if not (project_path / "README.md").exists():
        missing.append("README.md")
    return missing


@register
class ProjektHelferlein:
    """Runs health checks on all registered projects."""

    name = "projekt"

    def run(self, config: dict) -> int:
        """Run project health checks. Returns number of proposals created."""
        from brain.orchestrator import load_projects

        projects = load_projects()
        count = 0

        for name, pinfo in projects.items():
            path = Path(pinfo.get("path", "")).expanduser()
            if not path.exists():
                continue

            # Skip non-code projects
            if name in ("crm",):
                continue

            count += self._check_project(name, path, config)

        return count

    def _check_project(self, name: str, path: Path, config: dict) -> int:
        """Check a single project. Returns proposals created."""
        count = 0
        stack = _detect_stack(path)

        # 1. Run tests
        if stack and not has_pending_proposal("projekt", f"{name}: Tests"):
            success, output = _run_tests(path, stack)
            if not success:
                # Extract failure summary
                lines = output.splitlines()
                summary = "\n".join(lines[-20:])  # Last 20 lines

                prompt = (
                    f"Im Projekt '{name}' ({path}) schlagen Tests fehl.\n\n"
                    f"Test-Output:\n```\n{summary}\n```\n\n"
                    f"Bitte analysiere die Fehler und fixe sie. "
                    f"Fuehre danach die Tests erneut aus um sicherzustellen dass alles passt.\n\n"
                    f"WICHTIG: Nur die fehlgeschlagenen Tests fixen, "
                    f"keine anderen Aenderungen vornehmen."
                )

                create_proposal(
                    helferlein="projekt",
                    title=f"{name}: Tests fehlgeschlagen",
                    description=f"Test-Suite in {name} ({stack}) hat Fehler:\n\n{summary}",
                    priority="high",
                    action_type="fix",
                    prepared_prompt=prompt,
                    prepared_plan=f"1. Test-Fehler analysieren\n2. Code fixen\n3. Tests erneut laufen lassen",
                    project=name,
                    project_path=str(path),
                )
                count += 1
                logger.info(f"Proposal: {name} tests failed")

        # 2. Git status
        clean, git_output = _check_git_status(path)
        if not clean and "uncommitted" in git_output and not has_pending_proposal("projekt", f"{name}: Uncommitted"):
            create_proposal(
                helferlein="projekt",
                title=f"{name}: Uncommitted changes",
                description=f"Projekt {name} hat uncommittete Aenderungen:\n\n{git_output}",
                priority="low",
                action_type="notify",
            )
            count += 1

        # 3. Missing docs
        missing_docs = _check_docs(path)
        if missing_docs and not has_pending_proposal("projekt", f"{name}:"):
            docs_str = ", ".join(missing_docs)
            prompt = (
                f"Erstelle die fehlenden Dokumentations-Dateien fuer '{name}' ({path}):\n"
                f"Fehlend: {docs_str}\n\n"
                f"CLAUDE.md soll enthalten: Was das Projekt ist, Tech Stack, "
                f"Projektstruktur, wichtige Commands.\n"
                f"README.md soll enthalten: Projektbeschreibung, Setup, Usage."
            )

            create_proposal(
                helferlein="projekt",
                title=f"{name}: {docs_str} fehlt",
                description=f"Projekt {name} hat keine {docs_str}.",
                priority="low",
                action_type="change",
                prepared_prompt=prompt,
                prepared_plan=f"1. {docs_str} erstellen\n2. Inhalt basierend auf Code generieren",
                project=name,
                project_path=str(path),
            )
            count += 1

        return count
