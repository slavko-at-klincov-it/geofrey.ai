"""Decision Conflict Detection — check if a task conflicts with active decisions.

Three-level matching (deterministic, no LLM):
1. Scope match: affected files vs decision.scope
2. Keyword match: user input words vs decision.keywords
3. Semantic match: ChromaDB embedding similarity
"""

from brain.models import Decision
from knowledge.decisions import (
    load_decisions_from_files,
    query_decisions_by_scope,
    query_decisions_semantic,
    walk_dependency_chain,
)


def _keyword_match(user_input: str, decisions: list[Decision]) -> list[Decision]:
    """Find decisions whose keywords appear in user input."""
    words = set(user_input.lower().split())
    matched = []
    for dec in decisions:
        if dec.status != "active" or not dec.keywords:
            continue
        overlap = words & {kw.lower() for kw in dec.keywords}
        if overlap:
            matched.append(dec)
    return matched


def check_decision_conflicts(
    user_input: str,
    project_name: str,
    affected_files: list[str],
    config: dict,
) -> list[str]:
    """Check if user's task conflicts with active decisions.

    Returns list of formatted warnings for prompt injection.
    """
    all_decisions = load_decisions_from_files(project_name, config)
    if not all_decisions:
        return []

    active = [d for d in all_decisions if d.status == "active"]
    if not active:
        return []

    seen_ids: set[str] = set()
    relevant: list[Decision] = []

    def _add(decs: list[Decision]) -> None:
        for d in decs:
            if d.id not in seen_ids:
                seen_ids.add(d.id)
                relevant.append(d)

    # Level 1: Scope match
    if affected_files:
        _add(query_decisions_by_scope(affected_files, project_name, config))

    # Level 2: Keyword match
    _add(_keyword_match(user_input, active))

    # Level 3: Semantic match (only if ChromaDB is available)
    try:
        _add(query_decisions_semantic(user_input, project_name, config, top_k=3))
    except Exception:
        pass  # ChromaDB not available or no embeddings

    if not relevant:
        return []

    # Walk dependency chains for all matched decisions
    chain_ids: set[str] = set()
    for dec in list(relevant):
        chain = walk_dependency_chain(dec.id, all_decisions, depth=3)
        for dep in chain:
            if dep.id not in seen_ids:
                seen_ids.add(dep.id)
                relevant.append(dep)
                chain_ids.add(dep.id)

    # Format warnings
    warnings = []
    for dec in relevant:
        parts = [f"**{dec.id}: {dec.title}** [{dec.category}]"]
        if dec.rationale:
            parts.append(f"  Rationale: {dec.rationale}")
        if dec.change_warning:
            parts.append(f"  ⚠ WARNING: {dec.change_warning}")
        if dec.depends_on:
            parts.append(f"  Depends on: {', '.join(dec.depends_on)}")
        if dec.id in chain_ids:
            parts.append("  (included via dependency chain)")
        warnings.append("\n".join(parts))

    return warnings


def format_decision_context(
    relevant_decisions: list[Decision],
    conflicts: list[str],
) -> str:
    """Format decisions + warnings as a prompt section."""
    if not conflicts:
        return ""

    lines = [
        "The following active decisions are relevant to this task.",
        "Do NOT contradict these without explicit user approval.\n",
    ]
    for warning in conflicts:
        lines.append(f"- {warning}")

    return "\n".join(lines)
