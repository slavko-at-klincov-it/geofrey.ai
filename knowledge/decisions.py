"""Decision Storage + Retrieval — load, index, query, and traverse decisions.

Decisions are stored as Markdown files with YAML frontmatter (same format as
decision-guard). ChromaDB is used as a semantic retrieval index.
Source of truth: knowledge-base/decisions/{project}/*.md
"""

import json
import os
import re
from pathlib import Path

import ollama
import yaml

from brain.models import Decision
from knowledge.store import VectorStore, load_config


def _parse_decision_file(path: Path) -> Decision | None:
    """Parse a decision Markdown file with YAML frontmatter into a Decision.

    Expected format:
        ---
        id: DEC-001
        title: Use SQLite for task queue
        status: active
        ...
        ---
        ## Description
        ...
    """
    text = path.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        return None

    try:
        meta = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return None

    body = match.group(2).strip()

    # Extract sections from body
    description = ""
    rationale = ""
    change_warning = ""
    for section_match in re.finditer(r"##\s+(.+?)\n(.*?)(?=\n##|\Z)", body, re.DOTALL):
        heading = section_match.group(1).strip().lower()
        content = section_match.group(2).strip()
        if heading in ("description", "beschreibung"):
            description = content
        elif heading in ("rationale", "begründung", "why"):
            rationale = content
        elif heading in ("change warning", "change_warning", "warnung"):
            change_warning = content

    # Ensure list fields
    def to_list(val) -> list[str]:
        if isinstance(val, list):
            return val
        if isinstance(val, str) and val:
            return [s.strip() for s in val.split(",")]
        return []

    return Decision(
        id=str(meta.get("id", path.stem)),
        title=str(meta.get("title", path.stem)),
        status=str(meta.get("status", "active")),
        date=str(meta.get("date", "")),
        project=str(meta.get("project", "")),
        category=str(meta.get("category", "architecture")),
        description=meta.get("description", "") or description,
        rationale=meta.get("rationale", "") or rationale,
        change_warning=meta.get("change_warning", "") or change_warning,
        scope=to_list(meta.get("scope")),
        keywords=to_list(meta.get("keywords")),
        depends_on=to_list(meta.get("depends_on")),
        enables=to_list(meta.get("enables")),
        conflicts_with=to_list(meta.get("conflicts_with")),
        supersedes=to_list(meta.get("supersedes")),
    )


def load_decisions_from_files(project: str, config: dict) -> list[Decision]:
    """Load all decisions from knowledge-base/decisions/{project}/*.md."""
    decisions_base = Path(config["paths"].get("decisions", "knowledge-base/decisions"))
    project_dir = decisions_base / project
    if not project_dir.exists():
        return []
    decisions = []
    for md_file in sorted(project_dir.glob("*.md")):
        dec = _parse_decision_file(md_file)
        if dec:
            decisions.append(dec)
    return decisions


def index_decisions(decisions: list[Decision], config: dict) -> int:
    """Embed decisions into ChromaDB 'decisions' collection.

    Returns number of decisions indexed.
    """
    if not decisions:
        return 0

    store = VectorStore(config, collection_name="decisions")
    embed_model = config["embedding"]["model"]
    indexed = 0

    for dec in decisions:
        if dec.status != "active":
            continue

        # Build text for embedding — combine all meaningful fields
        parts = [
            f"Decision: {dec.title}",
            f"Category: {dec.category}",
        ]
        if dec.description:
            parts.append(f"Description: {dec.description}")
        if dec.rationale:
            parts.append(f"Rationale: {dec.rationale}")
        if dec.change_warning:
            parts.append(f"Change Warning: {dec.change_warning}")
        if dec.keywords:
            parts.append(f"Keywords: {', '.join(dec.keywords)}")
        text = "\n".join(parts)

        try:
            response = ollama.embed(model=embed_model, input=text[:6000])
            embedding = response["embeddings"][0]
        except Exception:
            continue

        store.upsert(
            ids=[f"dec_{dec.project}_{dec.id}"],
            documents=[text],
            embeddings=[embedding],
            metadatas=[{
                "project": dec.project,
                "decision_id": dec.id,
                "status": dec.status,
                "category": dec.category,
                "depends_on": json.dumps(dec.depends_on),
                "keywords": json.dumps(dec.keywords),
                "scope": json.dumps(dec.scope),
            }],
        )
        indexed += 1

    return indexed


def query_decisions_semantic(
    query: str, project: str, config: dict, top_k: int = 5
) -> list[Decision]:
    """Semantic search for relevant decisions via ChromaDB."""
    store = VectorStore(config, collection_name="decisions")
    if store.count() == 0:
        return []

    embed_model = config["embedding"]["model"]
    try:
        response = ollama.embed(model=embed_model, input=query)
        query_embedding = response["embeddings"][0]
    except Exception:
        return []

    results = store.query(query_embedding, top_k=top_k)
    if not results["documents"] or not results["documents"][0]:
        return []

    # Load full decisions from files to get complete data
    all_decisions = load_decisions_from_files(project, config)
    decisions_by_id = {d.id: d for d in all_decisions}

    matched = []
    for meta in results["metadatas"][0]:
        dec_id = meta.get("decision_id", "")
        if meta.get("project", "").lower() != project.lower():
            continue
        if dec_id in decisions_by_id:
            matched.append(decisions_by_id[dec_id])

    return matched


def query_decisions_by_scope(
    file_paths: list[str], project: str, config: dict
) -> list[Decision]:
    """Find decisions whose scope overlaps with given files."""
    all_decisions = load_decisions_from_files(project, config)

    matched = []
    for dec in all_decisions:
        if dec.status != "active" or not dec.scope:
            continue
        for scope_pattern in dec.scope:
            for fp in file_paths:
                # Check if any scope pattern matches (substring or glob-like)
                if scope_pattern in fp or fp.endswith(scope_pattern):
                    matched.append(dec)
                    break
            else:
                continue
            break

    return matched


def walk_dependency_chain(
    decision_id: str, decisions: list[Decision], depth: int = 5
) -> list[Decision]:
    """Traverse depends_on/enables transitively. Detect circular deps."""
    by_id = {d.id: d for d in decisions}
    visited: set[str] = set()
    chain: list[Decision] = []

    def _walk(did: str, current_depth: int) -> None:
        if did in visited or current_depth <= 0:
            return
        visited.add(did)
        dec = by_id.get(did)
        if not dec:
            return
        chain.append(dec)
        for dep_id in dec.depends_on:
            _walk(dep_id, current_depth - 1)
        for en_id in dec.enables:
            _walk(en_id, current_depth - 1)

    _walk(decision_id, depth)
    return chain
