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
        self.context_dir = Path(self.config.get("paths", {}).get("context", "knowledge-base/context"))
        # Resolve relative to project root
        if not self.context_dir.is_absolute():
            self.context_dir = Path(__file__).parent.parent / self.context_dir

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

    def get_context_prefix(self) -> str:
        """Load ALL personal context chunks as formatted block."""
        result = self.store.collection.get(include=["documents", "metadatas"])
        if not result["documents"]:
            return ""
        parts = ["=== PERSÖNLICHER KONTEXT (gilt immer) ==="]
        for doc, meta in zip(result["documents"], result["metadatas"]):
            ctx_type = meta.get("context_type", "unknown")
            parts.append(f"\n--- {ctx_type} ---")
            parts.append(doc)
        return "\n".join(parts)

    def count(self) -> int:
        return self.store.count()
