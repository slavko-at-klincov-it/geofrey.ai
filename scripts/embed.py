#!/usr/bin/env python3
"""Embed Claude Code knowledge base chunks into ChromaDB."""

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


def parse_frontmatter(filepath: Path) -> tuple[dict, str]:
    text = filepath.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if match:
        return yaml.safe_load(match.group(1)) or {}, match.group(2).strip()
    return {}, text.strip()


def get_all_chunks() -> list[dict]:
    chunks = []
    for md_file in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        rel_path = md_file.relative_to(KNOWLEDGE_DIR)
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


def embed_all(reset: bool = False, changed_only: bool = False):
    config = load_config()
    db_path = config["paths"]["vectordb"]
    import os
    db_path = os.path.expanduser(db_path)

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
        existing = collection.get(include=["metadatas"])
        existing_hashes = {}
        if existing and existing["ids"]:
            for i, doc_id in enumerate(existing["ids"]):
                meta = existing["metadatas"][i] if existing["metadatas"] else {}
                existing_hashes[doc_id] = meta.get("content_hash", "")
        chunks = [c for c in chunks if existing_hashes.get(c["id"], "") != c["content_hash"]]
        print(f"  {len(chunks)} chunks changed.")

    if not chunks:
        print("Nothing to embed.")
        return

    for i, chunk in enumerate(chunks, 1):
        embed_text = f"{chunk['title']}\n\n{chunk['content']}"
        if len(embed_text) > MAX_EMBED_CHARS:
            embed_text = embed_text[:MAX_EMBED_CHARS]
        print(f"  [{i}/{len(chunks)}] {chunk['path']}")
        response = ollama.embed(model="nomic-embed-text", input=embed_text)
        embedding = response["embeddings"][0]
        collection.upsert(
            ids=[chunk["id"]], embeddings=[embedding], documents=[chunk["content"]],
            metadatas=[{"title": chunk["title"], "category": chunk["category"],
                        "path": chunk["path"], "content_hash": chunk["content_hash"],
                        "last_verified": chunk["last_verified"],
                        "source_urls": ",".join(chunk["source_urls"]) if chunk["source_urls"] else ""}],
        )

    print(f"\nDone. Collection '{COLLECTION_NAME}' has {collection.count()} chunks.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Embed geofrey knowledge base")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--changed", action="store_true")
    args = parser.parse_args()
    try:
        ollama.show("nomic-embed-text")
    except Exception:
        print("Error: nomic-embed-text not found. Run: ollama pull nomic-embed-text")
        sys.exit(1)
    embed_all(reset=args.reset, changed_only=args.changed)
