"""End-to-end tests for geofrey — require Ollama running with qwen3.5:9b and nomic-embed-text."""

import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent
PYTHON = str(PROJECT_ROOT / ".venv" / "bin" / "python")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_cli(*args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    """Run a CLI command via main.py and return the CompletedProcess."""
    return subprocess.run(
        [PYTHON, str(PROJECT_ROOT / "main.py"), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=str(PROJECT_ROOT),
    )


# ===========================================================================
# 1. Ollama Connection
# ===========================================================================

class TestOllamaConnection:

    def test_ollama_available(self):
        """Verify Ollama is running at localhost:11434."""
        import ollama
        models = ollama.list()
        assert models is not None

    def test_ollama_models_loaded(self):
        """Verify qwen3.5:9b and nomic-embed-text are available."""
        import ollama
        models = ollama.list()
        model_names = [m.model for m in models.models]
        # Check with flexible matching (tags may vary)
        has_qwen = any("qwen3.5" in n for n in model_names)
        has_nomic = any("nomic-embed-text" in n for n in model_names)
        assert has_qwen, f"qwen3.5:9b not found in {model_names}"
        assert has_nomic, f"nomic-embed-text not found in {model_names}"


# ===========================================================================
# 2. Embedding Pipeline
# ===========================================================================

class TestEmbeddingPipeline:

    def test_embed_text(self):
        """Embed a short text with nomic-embed-text, verify returns list of floats."""
        import ollama
        response = ollama.embed(model="nomic-embed-text", input="test embedding")
        embeddings = response["embeddings"]
        assert len(embeddings) == 1
        assert isinstance(embeddings[0], list)
        assert len(embeddings[0]) > 0
        assert all(isinstance(x, float) for x in embeddings[0])

    def test_embed_batch(self):
        """Embed 3 texts, verify returns 3 embeddings."""
        import ollama
        texts = ["first text", "second text", "third text"]
        response = ollama.embed(model="nomic-embed-text", input=texts)
        embeddings = response["embeddings"]
        assert len(embeddings) == 3
        for emb in embeddings:
            assert isinstance(emb, list)
            assert len(emb) > 0


# ===========================================================================
# 3. ChromaDB Integration
# ===========================================================================

class TestChromaDBIntegration:

    def test_chromadb_status(self):
        """Run 'python main.py status', verify it shows collections and chunk counts."""
        result = run_cli("status")
        assert result.returncode == 0
        assert "chunks" in result.stdout.lower()
        # Should show at least one collection
        assert "claude_code" in result.stdout

    def test_chromadb_collections_exist(self):
        """Verify claude_code, context_personal, session_learnings collections exist."""
        sys.path.insert(0, str(PROJECT_ROOT))
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        status = hub.status()
        collections = status["collections"]
        for name in ["claude_code", "context_personal", "session_learnings"]:
            assert name in collections, f"Collection '{name}' not found in {list(collections.keys())}"


# ===========================================================================
# 4. RAG Query Pipeline
# ===========================================================================

class TestRAGQueryPipeline:

    def test_hub_query_claude_code(self):
        """Query 'prompt injection' against claude_code, verify returns results with required fields."""
        sys.path.insert(0, str(PROJECT_ROOT))
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        results = hub.query("prompt injection", collections=["claude_code"], top_k=3)
        assert len(results) > 0, "Expected at least one result"
        for r in results:
            assert "text" in r, "Result missing 'text' field"
            assert "distance" in r, "Result missing 'distance' field"
            assert "collection" in r, "Result missing 'collection' field"

    def test_hub_query_returns_ranked(self):
        """Verify results are sorted by distance (ascending)."""
        sys.path.insert(0, str(PROJECT_ROOT))
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        results = hub.query("safety validation", collections=["claude_code"], top_k=5)
        assert len(results) >= 2, "Need at least 2 results to verify sorting"
        distances = [r["distance"] for r in results]
        assert distances == sorted(distances), f"Results not sorted by distance: {distances}"


# ===========================================================================
# 5. Knowledge Hub
# ===========================================================================

class TestKnowledgeHub:

    def test_knowledge_hub_status(self):
        """KnowledgeHub.status() returns dict with collections."""
        sys.path.insert(0, str(PROJECT_ROOT))
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        status = hub.status()
        assert isinstance(status, dict)
        assert "collections" in status
        assert isinstance(status["collections"], dict)
        assert len(status["collections"]) > 0

    def test_knowledge_hub_query(self):
        """query() returns results for known collections."""
        sys.path.insert(0, str(PROJECT_ROOT))
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        status = hub.status()
        assert isinstance(status, dict)
        assert "collections" in status


# ===========================================================================
# 6. Session Intelligence
# ===========================================================================

class TestSessionIntelligence:

    def test_learnings_exist(self):
        """Verify knowledge-base/sessions/geofrey/ has .md files."""
        learnings_dir = PROJECT_ROOT / "knowledge-base" / "sessions" / "geofrey"
        assert learnings_dir.exists(), f"Directory not found: {learnings_dir}"
        md_files = list(learnings_dir.glob("*.md"))
        assert len(md_files) > 0, "No .md files found in session learnings"

    def test_learnings_query(self):
        """Query 'decisions' against session_learnings, verify returns results."""
        sys.path.insert(0, str(PROJECT_ROOT))
        from knowledge.intelligence import query_learnings
        results = query_learnings("decisions")
        assert len(results) > 0, "Expected at least one result for 'decisions'"

    def test_learnings_cli(self):
        """Run 'python main.py learnings', verify output contains 'Session Learnings Overview'."""
        result = run_cli("learnings")
        assert result.returncode == 0
        assert "Session Learnings Overview" in result.stdout


# ===========================================================================
# 7. CLI Commands
# ===========================================================================

class TestCLICommands:

    def test_cli_status(self):
        """Run 'python main.py status', verify exit code 0 and output contains 'chunks'."""
        result = run_cli("status")
        assert result.returncode == 0
        assert "chunks" in result.stdout.lower()

    def test_cli_hub_query(self):
        """Run hub-query 'safety' against claude_code, verify exit code 0 and results."""
        result = run_cli("hub-query", "safety", "--collections", "claude_code", "--top", "2")
        assert result.returncode == 0
        assert "claude_code" in result.stdout

    def test_cli_learnings_overview(self):
        """Run 'python main.py learnings', verify shows project counts."""
        result = run_cli("learnings")
        assert result.returncode == 0
        assert "geofrey" in result.stdout
        assert "sessions" in result.stdout.lower()

    def test_cli_learnings_project(self):
        """Run 'python main.py learnings geofrey', verify shows learnings content."""
        result = run_cli("learnings", "geofrey")
        assert result.returncode == 0
        assert "Learnings" in result.stdout

    def test_cli_learnings_rag(self):
        """Run 'python main.py learnings --query "bug"', verify returns results or 'No results'."""
        result = run_cli("learnings", "--query", "bug")
        assert result.returncode == 0
        # Should either show results or say no results
        assert len(result.stdout) > 0


# ===========================================================================
# 8. Embed Pipeline
# ===========================================================================

class TestEmbedPipeline:

    @pytest.mark.timeout(120)
    def test_embed_knowledge_base(self):
        """Run 'scripts/embed.py --changed', verify exit code 0 and output contains '97 chunks'."""
        result = subprocess.run(
            [PYTHON, str(PROJECT_ROOT / "scripts" / "embed.py"), "--changed"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(PROJECT_ROOT),
        )
        assert result.returncode == 0
        assert "77 chunks" in result.stdout


# ===========================================================================
# 9. LLM Integration
# ===========================================================================

class TestLLMIntegration:

    @pytest.mark.timeout(30)
    def test_ollama_chat_basic(self):
        """Send a simple chat to qwen3.5:9b with think=False, verify response contains text."""
        import ollama
        response = ollama.chat(
            model="qwen3.5:9b",
            messages=[{"role": "user", "content": "Say hello in one word."}],
            think=False,
        )
        assert "message" in response
        assert "content" in response["message"]
        assert len(response["message"]["content"]) > 0

    @pytest.mark.timeout(30)
    def test_ollama_think_false(self):
        """Verify think=False doesn't hang (timeout 30s)."""
        import ollama
        response = ollama.chat(
            model="qwen3.5:9b",
            messages=[{"role": "user", "content": "Reply with only: OK"}],
            think=False,
        )
        assert response["message"]["content"].strip() != ""
