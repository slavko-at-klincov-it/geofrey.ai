"""Quality Review — builds review questions from 3 sources (all Python, no LLM).

After Claude Code completes a task, geofrey sends review questions to verify
quality. Questions come from: hardcoded best practices per task-type,
active decisions (from ChromaDB/files), and file dependency analysis.

ChromaDB FINDS relevant context, Python FORMULATES questions, Claude ANSWERS.
"""

import subprocess
from pathlib import Path

from brain.context_gatherer import _query_chromadb, _run_git
from knowledge.decisions import load_decisions_from_files, query_decisions_by_scope


# Generic review questions per task type — researched best practices
REVIEW_QUESTIONS: dict[str, list[str]] = {
    "code-fix": [
        "Did you run the existing tests? Do they all pass?",
        "What was the root cause? Is it documented in a comment?",
        "Are there other places in the codebase with the same bug pattern?",
    ],
    "feature": [
        "Did you add tests for the new feature?",
        "Are existing APIs backward-compatible with this change?",
        "Did you update the documentation or CLAUDE.md?",
    ],
    "refactor": [
        "Is the external behavior unchanged? Did ALL tests pass?",
        "Are there external consumers or importers that could be affected?",
        "Did you verify no imports are broken?",
    ],
    "review": [
        "Did you check for OWASP Top 10 vulnerabilities?",
        "Are there any hardcoded secrets or credentials in the code?",
    ],
    "security": [
        "Did you check input validation on all endpoints?",
        "Are authentication and authorization properly separated?",
        "Did you verify DSGVO/GDPR compliance for personal data handling?",
    ],
    "doc-sync": [
        "Does the documentation match the current code?",
        "Are there recent code changes not yet reflected in the docs?",
    ],
    "research": [],
}


def _get_changed_files(project_path: str) -> list[str]:
    """Get list of files changed since last commit."""
    diff = _run_git(["diff", "--name-only"], project_path)
    staged = _run_git(["diff", "--cached", "--name-only"], project_path)
    untracked = _run_git(["ls-files", "--others", "--exclude-standard"], project_path)
    all_files = set()
    for output in (diff, staged, untracked):
        for f in output.splitlines():
            if f.strip():
                all_files.add(f.strip())
    return sorted(all_files)


def _find_importers(file_path: str, project_path: str) -> list[str]:
    """Find files that import a given module."""
    # Extract module name from file path (e.g., "src/auth.py" → "auth")
    module = Path(file_path).stem
    if module in ("__init__", "setup", "conftest"):
        return []
    try:
        result = subprocess.run(
            ["grep", "-rl", f"import {module}", "--include=*.py", "."],
            capture_output=True, text=True, cwd=project_path, timeout=5,
        )
        importers = [f for f in result.stdout.strip().splitlines() if f.strip() and f.strip() != f"./{file_path}"]
        return importers[:5]  # Max 5 to keep questions manageable
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []


def _build_impact_analysis_questions(
    changed_files: list[str],
    project_path: str,
) -> list[str]:
    """Build impact analysis questions based on what was changed.

    Checks for risky patterns: changed function signatures, modified constants,
    altered type definitions, config/schema files with high blast radius.
    """
    questions: list[str] = []

    if not changed_files:
        return questions

    # Check if any Python files with class/function definitions were changed
    py_files = [f for f in changed_files if f.endswith(".py")]
    if py_files:
        questions.append(
            "For each function signature, variable type, or constant you changed: "
            "did you verify ALL callers and importers are still compatible?"
        )

    # Check if config/schema files were changed (high blast radius)
    config_patterns = ("config", "schema", "model", "settings", "types")
    config_files = [f for f in changed_files if any(p in f.lower() for p in config_patterns)]
    if config_files:
        files_str = ", ".join(config_files[:3])
        questions.append(
            f"You changed config/schema files ({files_str}). "
            f"Did you check every consumer of these definitions for compatibility?"
        )

    # General "big picture" question if many files changed
    if len(changed_files) > 2:
        questions.append(
            "Step back and consider: do all these changes together make the app "
            "better? Is there anything that could be worse than before?"
        )

    return questions


def _post_actions_to_questions(post_actions: list[str]) -> list[str]:
    """Convert post-action statements into review questions.

    "Run existing tests to verify the fix" → "Did you run existing tests to verify the fix?"
    """
    questions = []
    for action in post_actions:
        # Clean up and convert to question
        clean = action.strip().rstrip(".")
        if clean.lower().startswith("never "):
            questions.append(f"Did you ensure: {clean}?")
        elif clean.lower().startswith(("run ", "add ", "update ", "check ", "produce ", "save ", "verify ", "preserve ")):
            questions.append(f"Did you {clean[0].lower()}{clean[1:]}?")
        else:
            questions.append(f"Did you: {clean}?")
    return questions


def build_review_questions(
    task_type: str,
    project_name: str,
    project_path: str,
    config: dict,
) -> list[str]:
    """Build quality review questions from 4 sources (all Python, no LLM).

    1. Post-actions from enrichment rule (converted to questions)
    2. Generic per task-type (hardcoded best practices)
    3. Decision-based (changed files → matching decisions → warnings)
    4. File-dependency-based (changed files → who imports them?)

    Returns list of question strings ready to send to Claude Code.
    """
    questions: list[str] = []

    # Source 1: Post-actions from enrichment rule → converted to questions
    from brain.enricher import load_enrichment_rules
    rules = load_enrichment_rules()
    rule = rules.get(task_type)
    if rule and rule.post_actions:
        questions.extend(_post_actions_to_questions(rule.post_actions))

    # Source 2: Generic per task-type (skip if already covered by post_actions)
    existing_lower = {q.lower() for q in questions}
    for q in REVIEW_QUESTIONS.get(task_type, []):
        # Skip if a similar question already exists (fuzzy: check key words overlap)
        q_words = set(q.lower().split())
        already_covered = any(
            len(q_words & set(eq.split())) >= 3
            for eq in existing_lower
        )
        if not already_covered:
            questions.append(q)

    # Source 2: Decision-based
    changed_files = _get_changed_files(project_path)
    if changed_files:
        matched_decisions = query_decisions_by_scope(changed_files, project_name, config)
        for dec in matched_decisions:
            if dec.change_warning:
                questions.append(
                    f"Decision {dec.id} ({dec.title}) warns: \"{dec.change_warning}\" — "
                    f"Did your changes respect this?"
                )

    # Source 3: File dependency analysis
    for changed_file in changed_files[:5]:  # Max 5 files
        importers = _find_importers(changed_file, project_path)
        if importers:
            importer_list = ", ".join(importers[:3])
            questions.append(
                f"You changed {changed_file}. These files import it: {importer_list}. "
                f"Did you check them for compatibility?"
            )

    # Source 4: Multi-perspective impact analysis
    questions.extend(_build_impact_analysis_questions(changed_files, project_path))

    return questions


def format_review_prompt(questions: list[str]) -> str:
    """Format review questions as a prompt to send to Claude Code."""
    if not questions:
        return ""

    lines = [
        "Before we finish — please verify these quality checks:",
        "",
    ]
    for i, q in enumerate(questions, 1):
        lines.append(f"{i}. {q}")

    lines.append("")
    lines.append("Answer briefly for each point. If something was missed, fix it now.")

    return "\n".join(lines)
