"""Knowledge Hub — unified query interface for all consumers.

No LangChain. Uses ChromaDB + Ollama directly.
"""

import os

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

    def status(self) -> dict:
        collections = {}
        for col in self.client.list_collections():
            collections[col.name] = col.count()
        return {"db_path": self.db_path, "collections": collections, "total_chunks": sum(collections.values())}
