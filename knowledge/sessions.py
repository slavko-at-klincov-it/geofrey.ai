"""Ingest Claude Code session data and inbox files."""

import json
import os
import shutil
from datetime import datetime
from pathlib import Path

import ollama
from rich.console import Console

from knowledge.store import VectorStore, load_config
from knowledge.ingest import load_and_chunk

console = Console()
HISTORY_FILE = Path.home() / ".claude" / "history.jsonl"
CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def get_project_slug(project_path: str) -> str:
    """Convert project path to Claude Code slug format.

    /Users/slavkoklincov/Code/geofrey → -Users-slavkoklincov-Code-geofrey
    """
    return project_path.replace("/", "-").lstrip("-")


def list_session_jsonls(project_slug: str | None = None) -> list[dict]:
    """List all session JSONL files, optionally filtered by project slug.

    Returns list of dicts with keys: path, session_id, project_slug.
    """
    results = []
    if project_slug:
        slugs = [project_slug]
    else:
        if not CLAUDE_PROJECTS_DIR.exists():
            return []
        slugs = [d.name for d in CLAUDE_PROJECTS_DIR.iterdir() if d.is_dir()]

    for slug in slugs:
        project_dir = CLAUDE_PROJECTS_DIR / slug
        if not project_dir.exists():
            continue
        for jsonl in sorted(project_dir.glob("*.jsonl")):
            session_id = jsonl.stem
            results.append({
                "path": jsonl,
                "session_id": session_id,
                "project_slug": slug,
            })
    return results


def parse_sessions(history_path: Path | None = None, min_length: int = 50) -> list[dict]:
    """Parse Claude Code history.jsonl into session groups."""
    path = history_path or HISTORY_FILE
    if not path.exists():
        console.print(f"[yellow]History file not found: {path}[/yellow]")
        return []

    sessions: dict[str, list[dict]] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            sid = entry.get("sessionId", "unknown")
            if sid not in sessions:
                sessions[sid] = []
            sessions[sid].append(entry)

    results = []
    for sid, entries in sessions.items():
        prompts = [e.get("display", "") for e in entries if len(e.get("display", "")) >= min_length]
        if not prompts:
            continue
        first = entries[0]
        ts = first.get("timestamp", 0)
        session_date = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d") if ts else "unknown"
        results.append({
            "session_id": sid, "date": session_date,
            "project": first.get("project", "unknown"),
            "text": "\n\n---\n\n".join(prompts), "prompt_count": len(prompts),
        })
    return results


def ingest_sessions(config: dict | None = None, max_sessions: int = 100):
    """Ingest Claude Code session summaries."""
    config = config or load_config()
    store = VectorStore(config, collection_name="sessions")
    embed_model = config["embedding"]["model"]

    sessions = parse_sessions()
    if not sessions:
        console.print("[yellow]No sessions found.[/yellow]")
        return 0

    sessions.sort(key=lambda s: s["date"], reverse=True)
    sessions = sessions[:max_sessions]
    total = 0

    for session in sessions:
        chunk_id = f"session_{session['session_id'][:12]}"
        text = session["text"][:3000]
        try:
            response = ollama.embed(model=embed_model, input=text)
            embedding = response["embeddings"][0]
        except Exception as e:
            console.print(f"[red]Embedding error for session {session['session_id'][:8]}: {e}[/red]")
            continue
        store.upsert(
            ids=[chunk_id], documents=[text], embeddings=[embedding],
            metadatas=[{"session_id": session["session_id"], "session_date": session["date"],
                        "project": session["project"], "prompt_count": session["prompt_count"]}],
        )
        total += 1

    console.print(f"[green]Ingested {total} sessions.[/green]")
    return total


def process_inbox(config: dict | None = None):
    """Process files from inbox directory, ingest, move to processed/."""
    config = config or load_config()
    inbox_dir = Path(os.path.expanduser(config.get("paths", {}).get("inbox", "~/knowledge/inbox")))

    if not inbox_dir.exists():
        inbox_dir.mkdir(parents=True, exist_ok=True)
        console.print(f"[dim]Created inbox: {inbox_dir}[/dim]")
        return 0

    processed_dir = inbox_dir / "processed"
    processed_dir.mkdir(exist_ok=True)

    supported = {".md", ".txt", ".pdf", ".py", ".json", ".yaml", ".yml"}
    files = [f for f in inbox_dir.iterdir() if f.is_file() and f.suffix.lower() in supported]
    if not files:
        console.print("[dim]Inbox is empty.[/dim]")
        return 0

    store = VectorStore(config, collection_name="knowledge")
    embed_model = config["embedding"]["model"]
    total = 0

    for file_path in files:
        chunks = load_and_chunk(file_path, config)
        if not chunks:
            continue
        texts = [c["text"] for c in chunks]
        try:
            response = ollama.embed(model=embed_model, input=texts)
            chunk_embeddings = response["embeddings"]
        except Exception as e:
            console.print(f"[red]Embedding error for {file_path.name}: {e}[/red]")
            continue
        for c in chunks:
            c["metadata"]["source_type"] = "inbox"
        store.upsert(
            ids=[c["id"] for c in chunks], documents=texts,
            embeddings=chunk_embeddings, metadatas=[c["metadata"] for c in chunks],
        )
        total += len(chunks)
        shutil.move(str(file_path), str(processed_dir / file_path.name))
        console.print(f"  [green]✓[/green] {file_path.name} ({len(chunks)} chunks)")

    console.print(f"[green]Processed {len(files)} files ({total} chunks) from inbox.[/green]")
    return total
