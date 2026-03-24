"""ChromaDB vector store wrapper with multi-collection support."""

import os
from pathlib import Path

import chromadb
import yaml


def load_config() -> dict:
    config_path = Path(__file__).parent.parent / "config" / "config.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


class VectorStore:
    def __init__(self, config: dict | None = None, collection_name: str = "knowledge"):
        self.config = config or load_config()
        db_path = os.path.expanduser(self.config["paths"]["vectordb"])
        os.makedirs(db_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=db_path)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def upsert(self, ids: list[str], documents: list[str], embeddings: list[list[float]], metadatas: list[dict]):
        self.collection.upsert(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)

    def query(self, query_embedding: list[float], top_k: int | None = None) -> dict:
        k = top_k or self.config["retrieval"]["top_k"]
        return self.collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )

    def count(self) -> int:
        return self.collection.count()

    def get_existing_ids(self, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        result = self.collection.get(ids=ids, include=[])
        return set(result["ids"])

    def delete(self, ids: list[str]):
        if ids:
            self.collection.delete(ids=ids)

    def list_collections(self) -> list[str]:
        return [c.name for c in self.client.list_collections()]

    def status(self) -> dict:
        collections = {}
        for c in self.client.list_collections():
            collections[c.name] = c.count()
        return {
            "total_chunks": sum(collections.values()),
            "db_path": os.path.expanduser(self.config["paths"]["vectordb"]),
            "collections": collections,
        }
