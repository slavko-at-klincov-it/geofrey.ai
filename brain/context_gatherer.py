"""Gather project context automatically for prompt enrichment.

Collects git state, architecture docs, CLAUDE.md, session learnings,
and DACH personal context to enrich user prompts before sending them
to Claude Code.
"""

import subprocess
from pathlib import Path

import chromadb
import ollama

from brain.models import ProjectContext
from brain.scope import detect_diff_scopes, scope_summary


def _run_git(args: list[str], project_path: str) -> str:
    """Run a git command and return stdout, or empty string on failure."""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True, text=True, cwd=project_path, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return ""


def _read_file_if_exists(path: Path) -> str:
    """Read a file and return its content, or empty string if missing."""
    try:
        if path.is_file():
            return path.read_text(encoding="utf-8").strip()
    except OSError:
        pass
    return ""


def _query_chromadb(config: dict, collection_name: str, query_text: str, top_k: int = 3) -> str:
    """Query a ChromaDB collection and return concatenated results.

    Returns empty string if ChromaDB is unavailable or collection is empty.
    """
    try:
        import os
        db_path = os.path.expanduser(config["paths"]["vectordb"])
        client = chromadb.PersistentClient(path=db_path)
        collection = client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        if collection.count() == 0:
            return ""

        embedding_model = config["embedding"]["model"]
        response = ollama.embed(model=embedding_model, input=query_text)
        query_embedding = response["embeddings"][0]

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents"],
        )
        docs = results.get("documents", [[]])[0]
        return "\n\n".join(doc for doc in docs if doc)
    except Exception:
        return ""


def gather_project_context(project_path: str, project_name: str, config: dict | None = None) -> ProjectContext:
    """Gather all available context for a project.

    Runs git commands, reads docs, queries ChromaDB for session learnings.
    All operations are fail-safe — missing data results in empty strings.

    Args:
        project_path: Absolute path to the project root.
        project_name: Human-readable project name (used for ChromaDB queries).
        config: Optional config dict. Loaded from config.yaml if not provided.

    Returns:
        ProjectContext dataclass with all gathered context.
    """
    if config is None:
        from knowledge.store import load_config
        config = load_config()

    project_root = Path(project_path)

    # Git state
    git_branch = _run_git(["branch", "--show-current"], project_path)
    git_status = _run_git(["status", "--short"], project_path)
    recent_commits = _run_git(["log", "--oneline", "-5"], project_path)

    # Diff scope
    scopes = detect_diff_scopes(project_path)
    diff_scope = scope_summary(scopes)

    # CLAUDE.md
    claude_md = _read_file_if_exists(project_root / "CLAUDE.md")

    # Architecture docs
    architecture = _read_file_if_exists(project_root / "docs" / "architecture.md")

    # Session learnings from ChromaDB
    session_learnings = _query_chromadb(
        config,
        "session_learnings",
        f"{project_name} recent learnings decisions bugs",
        top_k=3,
    )

    return ProjectContext(
        project_name=project_name,
        project_path=project_path,
        git_branch=git_branch,
        git_status=git_status,
        recent_commits=recent_commits,
        diff_scope=diff_scope,
        claude_md=claude_md,
        architecture=architecture,
        session_learnings=session_learnings,
    )


def gather_decision_context(
    project_path: str,
    project_name: str,
    user_input: str,
    config: dict,
) -> str:
    """Gather relevant decisions for this task.

    1. Get affected files from git diff
    2. Check scope overlap, keyword overlap, semantic search
    3. Walk dependency chains for matched decisions
    4. Format as prompt section with warnings
    """
    from brain.decision_checker import check_decision_conflicts, format_decision_context

    # Get affected files from git status
    git_status = _run_git(["diff", "--name-only"], project_path)
    staged = _run_git(["diff", "--cached", "--name-only"], project_path)
    affected = [f for f in (git_status + "\n" + staged).splitlines() if f.strip()]

    conflicts = check_decision_conflicts(user_input, project_name, affected, config)
    if not conflicts:
        return ""

    return format_decision_context([], conflicts)


def gather_claude_code_context(user_input: str, task_type: str, config: dict) -> str:
    """Retrieve relevant Claude Code best practices from knowledge base.

    Queries the claude_code ChromaDB collection with the task description
    to find relevant workflows, patterns, and tips.
    """
    query = f"{task_type} {user_input}"
    return _query_chromadb(config, "claude_code", query, top_k=2)


def gather_dach_context(config: dict) -> str:
    """Retrieve DACH personal context from ChromaDB.

    Queries the context_personal collection for profile, regulatory,
    and market context relevant to the Austrian/DACH market.

    Args:
        config: Config dict with paths and embedding model settings.

    Returns:
        Formatted context string, or empty string if unavailable.
    """
    return _query_chromadb(
        config,
        "context_personal",
        "DACH Austria profile DSGVO regulations market context",
        top_k=3,
    )
