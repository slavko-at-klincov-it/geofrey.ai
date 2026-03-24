"""Document loading, chunking, and embedding pipeline."""

import hashlib
import os
from pathlib import Path

import ollama
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from knowledge.store import VectorStore, load_config

console = Console()

SUPPORTED_EXTENSIONS = {
    ".md", ".txt", ".pdf", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".html", ".css", ".json", ".yaml", ".yml", ".toml", ".sh",
    ".sql", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".swift", ".rb",
}


def _file_id(path: str, chunk_index: int) -> str:
    return hashlib.sha256(f"{path}:{chunk_index}".encode()).hexdigest()[:16]


def _file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(8192), b""):
            h.update(block)
    return h.hexdigest()[:16]


def collect_files(docs_path: str) -> list[Path]:
    docs_path = os.path.expanduser(docs_path)
    root = Path(docs_path)
    if root.is_file():
        return [root] if root.suffix.lower() in SUPPORTED_EXTENSIONS else []
    files = []
    for ext in SUPPORTED_EXTENSIONS:
        files.extend(root.rglob(f"*{ext}"))
    return sorted(files)


def _chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> list[str]:
    """Simple paragraph-based chunking."""
    paragraphs = text.split("\n\n")
    chunks, current, current_len = [], [], 0
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if current_len + len(para) > chunk_size and current:
            chunks.append("\n\n".join(current))
            # Keep last paragraph for overlap
            if overlap > 0 and current:
                current = [current[-1]]
                current_len = len(current[0])
            else:
                current, current_len = [], 0
        current.append(para)
        current_len += len(para)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def load_and_chunk(file_path: Path, config: dict) -> list[dict]:
    """Load a file and split into chunks with metadata."""
    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception as e:
        console.print(f"[yellow]Skipping {file_path}: {e}[/yellow]")
        return []

    chunk_size = config["chunking"]["chunk_size"]
    overlap = config["chunking"]["chunk_overlap"]
    chunks_text = _chunk_text(text, chunk_size, overlap)

    file_hash = _file_hash(str(file_path))
    results = []
    for i, chunk in enumerate(chunks_text):
        results.append({
            "id": _file_id(str(file_path), i),
            "text": chunk,
            "metadata": {
                "source": str(file_path),
                "filename": file_path.name,
                "filetype": file_path.suffix.lower(),
                "chunk_index": i,
                "total_chunks": len(chunks_text),
                "file_hash": file_hash,
            },
        })
    return results


def ingest(docs_path: str, config: dict | None = None, collection_name: str = "knowledge"):
    """Main ingestion pipeline: load, chunk, embed, store."""
    config = config or load_config()
    store = VectorStore(config, collection_name=collection_name)
    embed_model = config["embedding"]["model"]

    files = collect_files(docs_path)
    if not files:
        console.print("[yellow]No supported files found.[/yellow]")
        return

    console.print(f"Found [bold]{len(files)}[/bold] files to process.")
    total_chunks, skipped = 0, 0

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Ingesting...", total=len(files))
        for file_path in files:
            progress.update(task, description=f"Processing {file_path.name}")
            chunks = load_and_chunk(file_path, config)
            if not chunks:
                progress.advance(task)
                skipped += 1
                continue

            # Check if unchanged
            existing = store.get_existing_ids([c["id"] for c in chunks])
            if existing and len(existing) == len(chunks):
                stored = store.collection.get(ids=[chunks[0]["id"]], include=["metadatas"])
                if stored["metadatas"] and stored["metadatas"][0].get("file_hash") == chunks[0]["metadata"]["file_hash"]:
                    progress.advance(task)
                    skipped += 1
                    continue

            texts = [c["text"] for c in chunks]
            try:
                response = ollama.embed(model=embed_model, input=texts)
                chunk_embeddings = response["embeddings"]
            except Exception as e:
                console.print(f"[red]Embedding error for {file_path.name}: {e}[/red]")
                progress.advance(task)
                continue

            store.upsert(
                ids=[c["id"] for c in chunks],
                documents=texts,
                embeddings=chunk_embeddings,
                metadatas=[c["metadata"] for c in chunks],
            )
            total_chunks += len(chunks)
            progress.advance(task)

    console.print(
        f"\n[green]Done![/green] Ingested [bold]{total_chunks}[/bold] chunks "
        f"from [bold]{len(files) - skipped}[/bold] files. Skipped [dim]{skipped}[/dim] unchanged."
    )
    console.print(f"Total in store: [bold]{store.count()}[/bold]")
