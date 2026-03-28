"""Personal context manager — DACH-specific context injection."""

import os
from pathlib import Path

import ollama
from rich.console import Console

from knowledge.store import VectorStore, load_config

console = Console()
COLLECTION_NAME = "context_personal"


class ContextManager:
    def __init__(self, config: dict | None = None):
        self.config = config or load_config()
        self.store = VectorStore(self.config, collection_name=COLLECTION_NAME)
        context_raw = self.config.get("paths", {}).get("context", "knowledge-base/context")
        context_expanded = Path(os.path.expanduser(context_raw))
        if context_expanded.is_absolute():
            self.context_dir = context_expanded.resolve()
        else:
            self.context_dir = (Path(__file__).parent.parent / context_expanded).resolve()

    def ingest_context_files(self):
        """Ingest all markdown files from context/ directory."""
        if not self.context_dir.exists():
            console.print(f"[yellow]Context directory not found: {self.context_dir}[/yellow]")
            return 0
        md_files = sorted(self.context_dir.glob("*.md"))
        if not md_files:
            console.print("[yellow]No markdown files found.[/yellow]")
            return 0

        total = 0
        for file_path in md_files:
            text = file_path.read_text(encoding="utf-8")
            chunk_id = f"ctx_{file_path.stem}"
            try:
                response = ollama.embed(model=self.config["embedding"]["model"], input=text)
                embedding = response["embeddings"][0]
            except Exception as e:
                console.print(f"[red]Embedding error for {file_path.name}: {e}[/red]")
                continue
            self.store.upsert(
                ids=[chunk_id],
                documents=[text],
                embeddings=[embedding],
                metadatas=[{"source": str(file_path), "filename": file_path.name, "context_type": file_path.stem}],
            )
            total += 1
        console.print(f"[green]Ingested {total} context files into {COLLECTION_NAME}.[/green]")
        return total

    def count(self) -> int:
        return self.store.count()
