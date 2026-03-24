#!/usr/bin/env python3
"""Embed Claude Code knowledge base chunks into ChromaDB."""

import os
import re
import sys
import hashlib
import argparse
from pathlib import Path

import yaml
import ollama
import chromadb

sys.path.insert(0, str(Path(__file__).parent.parent))
from knowledge.store import load_config

KNOWLEDGE_DIR = Path(__file__).parent.parent / "knowledge-base" / "claude-code"
COLLECTION_NAME = "claude_code"
MAX_EMBED_CHARS = 6000


def parse_frontmatter(filepath: Path) -> tuple[dict[str, str], str]:
    text: str = filepath.read_text(encoding="utf-8")
    match: re.Match[str] | None = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if match:
        return yaml.safe_load(match.group(1)) or {}, match.group(2).strip()
    return {}, text.strip()


def get_all_chunks() -> list[dict[str, str | list[str]]]:
    chunks: list[dict[str, str | list[str]]] = []
    for md_file in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        rel_path: Path = md_file.relative_to(KNOWLEDGE_DIR)
        fm, content = parse_frontmatter(md_file)
        chunks.append({
            "id": str(rel_path).replace("/", "__").replace(".md", ""),
            "path": str(rel_path), "filepath": str(md_file),
            "title": fm.get("title", md_file.stem),
            "category": fm.get("category", rel_path.parts[0] if rel_path.parts else "unknown"),
            "source_urls": fm.get("source_urls", []),
            "last_verified": fm.get("last_verified", ""),
            "content_hash": hashlib.sha256(content.encode()).hexdigest()[:16],
            "content": content,
        })
    return chunks


def embed_all(reset: bool = False, changed_only: bool = False) -> None:
    config: dict = load_config()
    embed_model: str = config["embedding"]["model"]
    db_path: str = os.path.expanduser(config["paths"]["vectordb"])

    os.makedirs(db_path, exist_ok=True)
    client = chromadb.PersistentClient(path=db_path)

    if reset:
        try:
            client.delete_collection(COLLECTION_NAME)
            print("Collection deleted.")
        except Exception:
            pass

    collection = client.get_or_create_collection(name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
    chunks = get_all_chunks()
    print(f"Found {len(chunks)} chunks in knowledge-base/claude-code/")

    if changed_only and not reset:
        existing: dict = collection.get(include=["metadatas"])
        existing_hashes: dict[str, str] = {}
        if existing and existing["ids"]:
            for i, doc_id in enumerate(existing["ids"]):
                meta: dict = existing["metadatas"][i] if existing["metadatas"] else {}
                existing_hashes[doc_id] = meta.get("content_hash", "")
        chunks = [c for c in chunks if existing_hashes.get(c["id"], "") != c["content_hash"]]
        print(f"  {len(chunks)} chunks changed.")

    if not chunks:
        print("Nothing to embed.")
        return

    for i, chunk in enumerate(chunks, 1):
        embed_text: str = f"{chunk['title']}\n\n{chunk['content']}"
        if len(embed_text) > MAX_EMBED_CHARS:
            embed_text = embed_text[:MAX_EMBED_CHARS]
        print(f"  [{i}/{len(chunks)}] {chunk['path']}")
        response: dict = ollama.embed(model=embed_model, input=embed_text)
        embedding: list[float] = response["embeddings"][0]
        collection.upsert(
            ids=[chunk["id"]], embeddings=[embedding], documents=[chunk["content"]],
            metadatas=[{"title": chunk["title"], "category": chunk["category"],
                        "path": chunk["path"], "content_hash": chunk["content_hash"],
                        "last_verified": chunk["last_verified"],
                        "source_urls": ",".join(chunk["source_urls"]) if chunk["source_urls"] else ""}],
        )

    print(f"\nDone. Collection '{COLLECTION_NAME}' has {collection.count()} chunks.")


if __name__ == "__main__":
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description="Embed geofrey knowledge base")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--changed", action="store_true")
    args: argparse.Namespace = parser.parse_args()
    _config: dict = load_config()
    _embed_model: str = _config["embedding"]["model"]
    try:
        ollama.show(_embed_model)
    except Exception:
        print(f"Error: {_embed_model} not found. Run: ollama pull {_embed_model}")
        sys.exit(1)
    embed_all(reset=args.reset, changed_only=args.changed)
