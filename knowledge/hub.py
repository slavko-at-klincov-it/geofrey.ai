"""Knowledge Hub — unified query interface for all consumers.

No LangChain. Uses ChromaDB + Ollama directly.
"""

import hashlib
import os
from pathlib import Path

import chromadb
import ollama

from knowledge.store import load_config


class KnowledgeHub:
    """Central knowledge hub with multi-collection query support."""

    def __init__(self, db_path: str | None = None, embedding_model: str = "nomic-embed-text"):
        config = load_config()
        self.db_path = os.path.expanduser(db_path or config["paths"]["vectordb"])
        self.embedding_model = embedding_model
        os.makedirs(self.db_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=self.db_path)

    def _embed(self, text: str) -> list[float]:
        try:
            response = ollama.embed(model=self.embedding_model, input=text)
            return response["embeddings"][0]
        except Exception:
            return []

    def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        try:
            response = ollama.embed(model=self.embedding_model, input=texts)
            return response["embeddings"]
        except Exception:
            return [[] for _ in texts]

    def query(self, text: str, collections: list[str], top_k: int = 5) -> list[dict]:
        """Query one or more collections, merge results by relevance."""
        query_embedding = self._embed(text)
        if not query_embedding:
            return []
        all_results = []

        for col_name in collections:
            try:
                collection = self.client.get_collection(col_name)
            except ValueError:
                continue
            count = collection.count()
            if count == 0:
                continue
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=min(top_k, count),
                include=["documents", "metadatas", "distances"],
            )
            if results["documents"] and results["documents"][0]:
                for doc, meta, dist in zip(
                    results["documents"][0],
                    results["metadatas"][0],
                    results["distances"][0],
                ):
                    all_results.append({
                        "text": doc,
                        "source": meta.get("filename", meta.get("source", "unknown")),
                        "collection": col_name,
                        "distance": dist,
                        "metadata": meta,
                    })

        all_results.sort(key=lambda x: x["distance"])
        return all_results[:top_k]

    def get_personal_context(self) -> str:
        """Load ALL chunks from context_personal collection."""
        try:
            collection = self.client.get_collection("context_personal")
        except ValueError:
            return ""
        result = collection.get(include=["documents", "metadatas"])
        if not result["documents"]:
            return ""
        parts = ["=== PERSÖNLICHER KONTEXT (gilt immer) ==="]
        for doc, meta in zip(result["documents"], result["metadatas"]):
            ctx_type = meta.get("context_type", "unknown")
            parts.append(f"\n--- {ctx_type} ---")
            parts.append(doc)
        return "\n".join(parts)

    def get_profile_context(self) -> str:
        """Load only profile chunk (for orchestrator — keeps context small)."""
        try:
            collection = self.client.get_collection("context_personal")
            profile = collection.get(ids=["ctx_profile"], include=["documents"])
            if profile["documents"]:
                return profile["documents"][0]
        except ValueError:
            pass
        return ""

    def ingest_text(self, text: str, collection: str, metadata: dict | None = None) -> str:
        chunk_id = hashlib.sha256(text.encode()).hexdigest()[:16]
        col = self.client.get_or_create_collection(name=collection, metadata={"hnsw:space": "cosine"})
        embedding = self._embed(text)
        col.upsert(ids=[chunk_id], documents=[text], embeddings=[embedding], metadatas=[metadata or {"source": "ingest_text"}])
        return chunk_id

    def ingest_file(self, path: str, collection: str = "knowledge", chunk_size: int = 512) -> int:
        file_path = Path(os.path.expanduser(path))
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        text = file_path.read_text(encoding="utf-8")
        paragraphs = text.split("\n\n")
        chunks, current, current_len = [], [], 0
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if current_len + len(para) > chunk_size and current:
                chunks.append("\n\n".join(current))
                current, current_len = [para], len(para)
            else:
                current.append(para)
                current_len += len(para)
        if current:
            chunks.append("\n\n".join(current))
        if not chunks:
            return 0
        col = self.client.get_or_create_collection(name=collection, metadata={"hnsw:space": "cosine"})
        embeddings = self._embed_batch(chunks)
        ids = [hashlib.sha256(f"{file_path}:{i}".encode()).hexdigest()[:16] for i in range(len(chunks))]
        metadatas = [{"source": str(file_path), "filename": file_path.name, "chunk_index": i, "total_chunks": len(chunks)} for i in range(len(chunks))]
        col.upsert(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)
        return len(chunks)

    def status(self) -> dict:
        collections = {}
        for col in self.client.list_collections():
            collections[col.name] = col.count()
        return {"db_path": self.db_path, "collections": collections, "total_chunks": sum(collections.values())}
