"""Session Intelligence — extract learnings from Claude Code sessions.

Map-Reduce pipeline: parse session JSONL → chunk → extract via LLM → consolidate → save as Markdown + index in ChromaDB.
"""

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path

import ollama
from rich.console import Console

from brain.prompts import render_template
from knowledge.sessions import CLAUDE_PROJECTS_DIR, list_session_jsonls
from knowledge.store import VectorStore, load_config

console = Console()

LEARNING_CATEGORIES = ["decisions", "bugs", "discoveries", "negative_knowledge", "configuration", "patterns"]
CATEGORY_HEADERS = {
    "decisions": "Decisions",
    "bugs": "Bugs Found",
    "discoveries": "Discoveries",
    "negative_knowledge": "Negative Knowledge",
    "configuration": "Configuration",
    "patterns": "Patterns",
}


def _slug_to_project_name(slug: str) -> str:
    """Derive a short project name from a Claude Code project slug.

    -Users-slavkoklincov-Code-geofrey → geofrey
    -Users-slavkoklincov-Code-ANE-Training → ane-training
    """
    parts = slug.strip("-").split("-")
    # Find 'Code' in path parts, take everything after it
    try:
        idx = parts.index("Code")
        name = "-".join(parts[idx + 1:])
    except ValueError:
        name = parts[-1] if parts else slug
    return name.lower()


def parse_session_jsonl(path: Path) -> list[dict]:
    """Parse a session JSONL file into conversation turns.

    Returns list of dicts with keys: role ('user'|'assistant'), text, timestamp.
    Filters out noise: progress, file-history-snapshot, thinking, tool_use.
    """
    turns = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            entry_type = entry.get("type", "")
            if entry_type not in ("user", "assistant"):
                continue

            message = entry.get("message", {})
            content = message.get("content", "")
            timestamp = entry.get("timestamp", "")

            # Extract text from content
            text_parts = []
            if isinstance(content, str):
                text_parts.append(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text_parts.append(block.get("text", ""))

            text = "\n".join(text_parts).strip()
            if len(text) < 30:
                continue

            turns.append({
                "role": entry_type,
                "text": text,
                "timestamp": timestamp,
            })
    return turns


def chunk_conversation(turns: list[dict], max_chars: int = 2500) -> list[str]:
    """Group conversation turns into LLM-sized chunks.

    Never splits a turn across chunks. Truncates individual turns > max_chars.
    """
    chunks = []
    current_parts = []
    current_len = 0

    for turn in turns:
        prefix = "[USER]" if turn["role"] == "user" else "[ASSISTANT]"
        text = turn["text"]
        if len(text) > max_chars:
            text = text[:max_chars] + "\n[truncated]"
        formatted = f"{prefix} {text}"

        if current_len + len(formatted) > max_chars and current_parts:
            chunks.append("\n\n".join(current_parts))
            current_parts = [formatted]
            current_len = len(formatted)
        else:
            current_parts.append(formatted)
            current_len += len(formatted)

    if current_parts:
        chunks.append("\n\n".join(current_parts))
    return chunks


def _parse_llm_json(text: str) -> dict:
    """Parse JSON from LLM response with fallbacks."""
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting JSON block from markdown code fence
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try finding first { ... } block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return {}


def extract_learnings_chunk(chunk: str, project_name: str, session_date: str, config: dict) -> dict:
    """Map phase: extract learnings from one chunk via LLM."""
    model = config["llm"]["model"]
    prompt = render_template(
        "session-extract",
        project_name=project_name,
        session_date=session_date,
        chunk_text=chunk,
    )

    try:
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            think=False,
        )
        return _parse_llm_json(response["message"]["content"])
    except Exception as e:
        console.print(f"  [red]LLM error (extract): {e}[/red]")
        return {}


def _llm_consolidate(merged: dict, project_name: str, session_date: str, config: dict) -> dict:
    """Run one LLM consolidation call on a merged learnings dict."""
    raw_text = json.dumps(merged, indent=2, ensure_ascii=False)
    model = config["llm"]["model"]
    prompt = render_template(
        "session-consolidate",
        project_name=project_name,
        session_date=session_date,
        raw_learnings=raw_text,
    )
    try:
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            think=False,
        )
        result = _parse_llm_json(response["message"]["content"])
        if result:
            return result
    except Exception as e:
        console.print(f"  [red]LLM error (consolidate): {e}[/red]")
    return merged


def consolidate_learnings(chunk_results: list[dict], project_name: str, session_date: str, config: dict) -> dict:
    """Reduce phase: multi-pass consolidation for large sessions.

    Batches chunk results into groups of 5, consolidates each group via LLM,
    then consolidates the consolidated results until everything fits.
    """
    # If few chunks, merge and consolidate in one pass
    if len(chunk_results) <= 5:
        merged = {cat: [] for cat in LEARNING_CATEGORIES}
        for result in chunk_results:
            for cat in LEARNING_CATEGORIES:
                items = result.get(cat, [])
                if isinstance(items, list):
                    merged[cat].extend(items)
        total_items = sum(len(v) for v in merged.values())
        if total_items <= 5:
            return merged
        return _llm_consolidate(merged, project_name, session_date, config)

    # Multi-pass: batch into groups of 5, consolidate each group
    batch_size = 5
    current_results = chunk_results

    pass_num = 0
    while len(current_results) > 1:
        pass_num += 1
        console.print(f"  Consolidation pass {pass_num} ({len(current_results)} groups)...")
        next_results = []

        for i in range(0, len(current_results), batch_size):
            batch = current_results[i:i + batch_size]
            merged = {cat: [] for cat in LEARNING_CATEGORIES}
            for result in batch:
                for cat in LEARNING_CATEGORIES:
                    items = result.get(cat, [])
                    if isinstance(items, list):
                        merged[cat].extend(items)

            total_items = sum(len(v) for v in merged.values())
            if total_items > 5:
                consolidated = _llm_consolidate(merged, project_name, session_date, config)
                next_results.append(consolidated)
            else:
                next_results.append(merged)

        current_results = next_results

        # Safety: max 4 passes to avoid infinite loops
        if pass_num >= 4:
            break

    # Final merge of remaining results
    final = {cat: [] for cat in LEARNING_CATEGORIES}
    for result in current_results:
        for cat in LEARNING_CATEGORIES:
            items = result.get(cat, [])
            if isinstance(items, list):
                final[cat].extend(items)
    return final


def _get_session_date(turns: list[dict]) -> str:
    """Extract session date from first turn timestamp."""
    if turns and turns[0].get("timestamp"):
        ts = turns[0]["timestamp"]
        try:
            if isinstance(ts, str):
                return ts[:10]
            return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
        except Exception:
            pass
    return datetime.now().strftime("%Y-%m-%d")


def save_learnings_md(learnings: dict, project_name: str, session_id: str, session_date: str, config: dict) -> Path:
    """Write learnings as Markdown file with YAML frontmatter."""
    base_dir = Path(os.path.expanduser(config["paths"]["session_learnings"]))
    project_dir = base_dir / project_name
    project_dir.mkdir(parents=True, exist_ok=True)

    sid_prefix = session_id[:8]
    filename = f"{session_date}_{sid_prefix}.md"
    filepath = project_dir / filename

    content_text = json.dumps(learnings, ensure_ascii=False)
    content_hash = hashlib.sha256(content_text.encode()).hexdigest()[:16]

    lines = [
        "---",
        f"project: {project_name}",
        f"session_id: {session_id}",
        f'session_date: "{session_date}"',
        f'extracted_at: "{datetime.now().isoformat(timespec="seconds")}"',
        f"content_hash: {content_hash}",
        "---",
        "",
        f"# Session Learnings: {project_name} ({session_date})",
        "",
    ]

    for cat in LEARNING_CATEGORIES:
        items = learnings.get(cat, [])
        if not items:
            continue
        header = CATEGORY_HEADERS.get(cat, cat.title())
        lines.append(f"## {header}")
        for item in items:
            if isinstance(item, str) and item.strip():
                lines.append(f"- {item.strip()}")
            elif isinstance(item, dict) and cat == "decisions":
                # Structured decision — write as sub-section
                title = item.get("title", "Untitled Decision")
                lines.append(f"\n### {title}")
                if item.get("rationale"):
                    lines.append(f"**Rationale:** {item['rationale']}")
                if item.get("category"):
                    lines.append(f"**Category:** {item['category']}")
                if item.get("scope"):
                    lines.append(f"**Scope:** {', '.join(item['scope'])}")
                if item.get("keywords"):
                    lines.append(f"**Keywords:** {', '.join(item['keywords'])}")
                if item.get("change_warning"):
                    lines.append(f"**Change Warning:** {item['change_warning']}")
                lines.append("")
        lines.append("")

    filepath.write_text("\n".join(lines), encoding="utf-8")

    # Save structured decisions as separate decision files
    _save_decision_files(learnings, project_name, session_date, config)

    return filepath


def _save_decision_files(learnings: dict, project_name: str, session_date: str, config: dict) -> None:
    """Save structured decisions as individual Markdown files in knowledge-base/decisions/."""
    decisions = learnings.get("decisions", [])
    if not decisions:
        return

    decisions_base = Path(config["paths"].get("decisions", "knowledge-base/decisions"))
    project_dir = decisions_base / project_name
    project_dir.mkdir(parents=True, exist_ok=True)

    for i, item in enumerate(decisions):
        if not isinstance(item, dict) or not item.get("title"):
            continue

        # Generate ID from date + index
        dec_id = f"DEC-{session_date.replace('-', '')}-{i + 1:02d}"
        slug = re.sub(r"[^a-z0-9]+", "-", item["title"].lower()).strip("-")[:40]
        filename = f"{dec_id}-{slug}.md"
        filepath = project_dir / filename

        if filepath.exists():
            continue

        lines = [
            "---",
            f"id: {dec_id}",
            f"title: \"{item['title']}\"",
            "status: active",
            f"date: \"{session_date}\"",
            f"project: {project_name}",
            f"category: {item.get('category', 'implementation')}",
        ]
        if item.get("scope"):
            lines.append(f"scope: {json.dumps(item['scope'])}")
        if item.get("keywords"):
            lines.append(f"keywords: {json.dumps(item['keywords'])}")
        lines.append("---")
        lines.append("")
        if item.get("rationale"):
            lines.append("## Rationale")
            lines.append(item["rationale"])
            lines.append("")
        if item.get("change_warning"):
            lines.append("## Change Warning")
            lines.append(item["change_warning"])
            lines.append("")

        filepath.write_text("\n".join(lines), encoding="utf-8")


def index_learnings(md_path: Path, project_name: str, session_id: str, session_date: str, learnings: dict, config: dict) -> None:
    """Embed each category as a separate chunk in ChromaDB session_learnings collection."""
    store = VectorStore(config, collection_name="session_learnings")
    embed_model = config["embedding"]["model"]
    sid_prefix = session_id[:8]

    for cat in LEARNING_CATEGORIES:
        items = learnings.get(cat, [])
        if not items:
            continue

        # Build text for embedding
        text_parts = []
        for item in items:
            if isinstance(item, str):
                text_parts.append(f"- {item}")
            elif isinstance(item, dict) and cat == "decisions":
                text_parts.append(f"- {item.get('title', '')}: {item.get('rationale', '')}")
        text = f"[{project_name}] {CATEGORY_HEADERS.get(cat, cat)}:\n" + "\n".join(text_parts)
        chunk_id = f"learn_{project_name}_{sid_prefix}_{cat}"

        try:
            response = ollama.embed(model=embed_model, input=text[:6000])
            embedding = response["embeddings"][0]
        except Exception as e:
            console.print(f"  [red]Embedding error ({cat}): {e}[/red]")
            continue

        store.upsert(
            ids=[chunk_id],
            documents=[text],
            embeddings=[embedding],
            metadatas=[{
                "project": project_name,
                "session_id": session_id,
                "session_date": session_date,
                "category": cat,
                "source_file": str(md_path),
            }],
        )

    # Index structured decisions in dedicated "decisions" collection
    _index_structured_decisions(learnings, project_name, session_id, session_date, config)


def _index_structured_decisions(
    learnings: dict, project_name: str, session_id: str, session_date: str, config: dict
) -> None:
    """Index structured decisions in the dedicated 'decisions' ChromaDB collection."""
    decisions = learnings.get("decisions", [])
    structured = [d for d in decisions if isinstance(d, dict) and d.get("title")]
    if not structured:
        return

    store = VectorStore(config, collection_name="decisions")
    embed_model = config["embedding"]["model"]
    sid_prefix = session_id[:8]

    for i, dec in enumerate(structured):
        text = f"Decision: {dec['title']}"
        if dec.get("rationale"):
            text += f"\nRationale: {dec['rationale']}"
        if dec.get("change_warning"):
            text += f"\nChange Warning: {dec['change_warning']}"
        if dec.get("keywords"):
            text += f"\nKeywords: {', '.join(dec['keywords'])}"

        chunk_id = f"dec_{project_name}_{sid_prefix}_{i}"

        try:
            response = ollama.embed(model=embed_model, input=text[:6000])
            embedding = response["embeddings"][0]
        except Exception:
            continue

        store.upsert(
            ids=[chunk_id],
            documents=[text],
            embeddings=[embedding],
            metadatas=[{
                "project": project_name,
                "session_id": session_id,
                "session_date": session_date,
                "category": dec.get("category", "implementation"),
                "decision_id": f"DEC-{session_date.replace('-', '')}-{i + 1:02d}",
                "scope": json.dumps(dec.get("scope", [])),
                "keywords": json.dumps(dec.get("keywords", [])),
            }],
        )


def extract_session(session_path: Path, project_name: str, config: dict) -> Path | None:
    """Full pipeline for one session: parse → chunk → map → reduce → save → index."""
    session_id = session_path.stem

    console.print(f"  Processing session [cyan]{session_id[:8]}[/cyan]...")

    # Parse
    turns = parse_session_jsonl(session_path)
    if not turns:
        console.print(f"  [dim]No meaningful content, skipping.[/dim]")
        return None

    session_date = _get_session_date(turns)

    # Check if already extracted
    base_dir = Path(os.path.expanduser(config["paths"]["session_learnings"]))
    expected_file = base_dir / project_name / f"{session_date}_{session_id[:8]}.md"
    if expected_file.exists():
        console.print(f"  [dim]Already extracted, skipping.[/dim]")
        return None

    # Chunk
    chunks = chunk_conversation(turns)
    console.print(f"  {len(turns)} turns → {len(chunks)} chunks")

    # Map phase
    chunk_results = []
    for i, chunk in enumerate(chunks):
        console.print(f"  Extracting chunk {i + 1}/{len(chunks)}...", end="\r")
        result = extract_learnings_chunk(chunk, project_name, session_date, config)
        if result:
            chunk_results.append(result)

    if not chunk_results:
        console.print(f"  [yellow]No learnings extracted.[/yellow]")
        return None

    # Reduce phase
    console.print(f"  Consolidating {len(chunk_results)} chunk results...")
    learnings = consolidate_learnings(chunk_results, project_name, session_date, config)

    # Check if we actually got anything
    total_items = sum(len(v) for v in learnings.values() if isinstance(v, list))
    if total_items == 0:
        console.print(f"  [yellow]No learnings after consolidation.[/yellow]")
        return None

    # Save markdown
    md_path = save_learnings_md(learnings, project_name, session_id, session_date, config)
    console.print(f"  [green]Saved:[/green] {md_path} ({total_items} items)")

    # Index in ChromaDB
    index_learnings(md_path, project_name, session_id, session_date, learnings, config)
    console.print(f"  [green]Indexed in ChromaDB.[/green]")

    return md_path


def extract_all(project: str | None = None, config: dict | None = None, max_sessions: int = 10, reprocess: bool = False) -> int:
    """Extract learnings from unprocessed sessions.

    Args:
        project: Project name filter (matches against slug-derived name).
        config: Config dict.
        max_sessions: Maximum sessions to process.
        reprocess: If True, re-extract even if MD file exists.

    Returns:
        Number of sessions processed.
    """
    config = config or load_config()

    # Find matching session files
    if project:
        # Find the matching project slug
        matching_slugs = []
        if CLAUDE_PROJECTS_DIR.exists():
            for d in CLAUDE_PROJECTS_DIR.iterdir():
                if d.is_dir() and _slug_to_project_name(d.name) == project.lower():
                    matching_slugs.append(d.name)
        if not matching_slugs:
            console.print(f"[yellow]No Claude Code sessions found for project '{project}'.[/yellow]")
            console.print("[dim]Available projects:[/dim]")
            if CLAUDE_PROJECTS_DIR.exists():
                for d in sorted(CLAUDE_PROJECTS_DIR.iterdir()):
                    if d.is_dir() and any(d.glob("*.jsonl")):
                        console.print(f"  {_slug_to_project_name(d.name)}")
            return 0
        sessions = []
        for slug in matching_slugs:
            sessions.extend(list_session_jsonls(slug))
    else:
        sessions = list_session_jsonls()

    if not sessions:
        console.print("[yellow]No session files found.[/yellow]")
        return 0

    # Sort by file modification time (newest first)
    sessions.sort(key=lambda s: s["path"].stat().st_mtime, reverse=True)
    sessions = sessions[:max_sessions]

    console.print(f"[bold]Processing {len(sessions)} sessions...[/bold]\n")
    processed = 0

    for session in sessions:
        project_name = _slug_to_project_name(session["project_slug"])

        # Skip if already extracted (unless reprocess)
        if not reprocess:
            base_dir = Path(os.path.expanduser(config["paths"]["session_learnings"]))
            existing = list(base_dir.glob(f"{project_name}/*_{session['session_id'][:8]}.md"))
            if existing:
                console.print(f"  [dim]{project_name}/{session['session_id'][:8]} — already extracted[/dim]")
                continue

        result = extract_session(session["path"], project_name, config)
        if result:
            processed += 1
        console.print()

    console.print(f"[bold green]Done. Extracted learnings from {processed} sessions.[/bold green]")
    return processed


def view_learnings(project: str | None = None, config: dict | None = None) -> str:
    """Read and display learnings for a project (or list all projects)."""
    config = config or load_config()
    base_dir = Path(os.path.expanduser(config["paths"]["session_learnings"]))

    if not base_dir.exists():
        return "No learnings found. Run 'python main.py learn' first."

    if project:
        project_dir = base_dir / project.lower()
        if not project_dir.exists():
            return f"No learnings for project '{project}'."
        files = sorted(project_dir.glob("*.md"), reverse=True)
        if not files:
            return f"No learnings for project '{project}'."
        parts = [f"# Learnings: {project} ({len(files)} sessions)\n"]
        for f in files:
            parts.append(f.read_text(encoding="utf-8"))
            parts.append("\n---\n")
        return "\n".join(parts)
    else:
        # List all projects with counts
        dirs = sorted(d for d in base_dir.iterdir() if d.is_dir())
        if not dirs:
            return "No learnings found."
        lines = ["# Session Learnings Overview\n"]
        for d in dirs:
            count = len(list(d.glob("*.md")))
            lines.append(f"  {d.name}: {count} sessions")
        lines.append(f"\nUse 'python main.py learnings <project>' for details.")
        return "\n".join(lines)


def query_learnings(query: str, project: str | None = None, config: dict | None = None, top_k: int = 5) -> list[dict]:
    """RAG query against session_learnings collection."""
    config = config or load_config()
    store = VectorStore(config, collection_name="session_learnings")

    if store.count() == 0:
        return []

    embed_model = config["embedding"]["model"]
    response = ollama.embed(model=embed_model, input=query)
    query_embedding = response["embeddings"][0]

    results = store.query(query_embedding, top_k=top_k)
    if not results["documents"] or not results["documents"][0]:
        return []

    output = []
    for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
        entry = {"text": doc, "distance": dist, **meta}
        if project and entry.get("project", "").lower() != project.lower():
            continue
        output.append(entry)
    return output
