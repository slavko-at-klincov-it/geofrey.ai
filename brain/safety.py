"""Safety system — chunks that are ALWAYS injected into every prompt."""

# Safety chunk IDs that are always retrieved from claude_code collection
ALWAYS_INJECT = [
    "safety__safety-scope",
    "safety__safety-secrets",
    "safety__safety-patterns",
]


def get_safety_context(client, collection_name: str = "claude_code") -> str:
    """Retrieve safety chunks from knowledge base. Always injected."""
    try:
        collection = client.get_collection(collection_name)
        results = collection.get(ids=ALWAYS_INJECT, include=["documents", "metadatas"])
    except Exception:
        return ""

    if not results or not results["documents"]:
        return ""

    parts = ["=== SAFETY RULES (always apply) ==="]
    for doc in results["documents"]:
        parts.append(doc)
    return "\n".join(parts)
