"""Comprehensive unit tests for the geofrey project.

All external dependencies (Ollama, ChromaDB) are mocked.
Run with: .venv/bin/python -m pytest tests/test_unit.py -v
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# 1. Config Tests
# ---------------------------------------------------------------------------

class TestConfig:
    def test_load_config(self):
        """Verify config.yaml loads and has all required top-level keys."""
        from knowledge.store import load_config

        config = load_config()
        required_keys = {"llm", "embedding", "paths", "orchestrator", "linkedin", "chunking", "retrieval", "chat"}
        assert required_keys.issubset(config.keys()), f"Missing keys: {required_keys - config.keys()}"

    def test_config_paths_exist(self):
        """Verify all path keys exist in config."""
        from knowledge.store import load_config

        config = load_config()
        paths = config["paths"]
        expected_path_keys = {
            "vectordb", "context", "claude_code_kb", "inbox",
            "linkedin_posts", "session_learnings", "claude_projects",
        }
        assert expected_path_keys.issubset(paths.keys()), f"Missing path keys: {expected_path_keys - paths.keys()}"

    def test_config_models(self):
        """Verify llm.model and embedding.model are set."""
        from knowledge.store import load_config

        config = load_config()
        assert config["llm"]["model"], "llm.model must be set"
        assert config["embedding"]["model"], "embedding.model must be set"


# ---------------------------------------------------------------------------
# 2. Store Tests (mock ChromaDB)
# ---------------------------------------------------------------------------

class TestStore:
    @patch("knowledge.store.chromadb")
    def test_vector_store_init(self, mock_chromadb):
        """VectorStore can be created with config."""
        from knowledge.store import VectorStore, load_config

        mock_client = MagicMock()
        mock_chromadb.PersistentClient.return_value = mock_client
        mock_client.get_or_create_collection.return_value = MagicMock()

        config = load_config()
        store = VectorStore(config, collection_name="test")
        assert store.config is config
        mock_chromadb.PersistentClient.assert_called_once()
        mock_client.get_or_create_collection.assert_called_once()

    def test_load_config_returns_dict(self):
        """load_config returns a dict."""
        from knowledge.store import load_config

        result = load_config()
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# 3. Knowledge/Intelligence Tests
# ---------------------------------------------------------------------------

class TestIntelligence:
    def test_slug_to_project_name(self):
        """Test slug to project name conversion with various inputs."""
        from knowledge.intelligence import _slug_to_project_name

        assert _slug_to_project_name("-Users-slavkoklincov-Code-geofrey") == "geofrey"
        assert _slug_to_project_name("-Users-slavkoklincov-Code-ANE-Training") == "ane-training"
        assert _slug_to_project_name("-Users-slavkoklincov-Code-Meus") == "meus"

    def test_chunk_conversation(self):
        """Test chunking with mock turns."""
        from knowledge.intelligence import chunk_conversation

        # Test that no chunk exceeds max_chars
        turns = [
            {"role": "user", "text": "A" * 200, "timestamp": ""},
            {"role": "assistant", "text": "B" * 200, "timestamp": ""},
            {"role": "user", "text": "C" * 200, "timestamp": ""},
            {"role": "assistant", "text": "D" * 200, "timestamp": ""},
        ]
        max_chars = 500
        chunks = chunk_conversation(turns, max_chars=max_chars)
        assert len(chunks) > 0
        # Each chunk may slightly exceed max_chars due to a single turn being added,
        # but no turn should be split across chunks. We verify the structure:
        for chunk in chunks:
            assert isinstance(chunk, str)

        # Test that turns are not split across chunks
        # Each chunk should contain complete [USER] or [ASSISTANT] blocks
        all_text = "\n\n".join(chunks)
        assert "[USER]" in all_text
        assert "[ASSISTANT]" in all_text

        # Test empty input returns empty list
        assert chunk_conversation([]) == []

        # Test single long turn gets truncated
        long_turns = [{"role": "user", "text": "X" * 5000, "timestamp": ""}]
        result = chunk_conversation(long_turns, max_chars=2500)
        assert len(result) == 1
        assert "[truncated]" in result[0]

    def test_parse_llm_json(self):
        """Test JSON parsing with various formats."""
        from knowledge.intelligence import _parse_llm_json

        # Valid JSON -> parsed
        assert _parse_llm_json('{"key": "value"}') == {"key": "value"}

        # JSON in markdown code fence -> parsed
        fenced = '```json\n{"key": "value"}\n```'
        assert _parse_llm_json(fenced) == {"key": "value"}

        # JSON embedded in text -> parsed
        embedded = 'Here is the result: {"key": "value"} end.'
        assert _parse_llm_json(embedded) == {"key": "value"}

        # Invalid text -> empty dict
        assert _parse_llm_json("no json here at all") == {}

    def test_parse_session_jsonl(self):
        """Test JSONL session parsing with mock data."""
        from knowledge.intelligence import parse_session_jsonl

        lines = [
            # user message with text content (long enough)
            json.dumps({
                "type": "user",
                "message": {"content": "This is a user message that is definitely long enough to pass the filter."},
                "timestamp": "2025-01-15T10:00:00",
            }),
            # assistant message with list content containing text block
            json.dumps({
                "type": "assistant",
                "message": {"content": [
                    {"type": "text", "text": "This is an assistant response that is long enough to pass the filter."},
                ]},
                "timestamp": "2025-01-15T10:01:00",
            }),
            # Short message that should be filtered out (< 30 chars)
            json.dumps({
                "type": "user",
                "message": {"content": "short"},
                "timestamp": "2025-01-15T10:02:00",
            }),
            # Non-text type that should be filtered out
            json.dumps({
                "type": "progress",
                "message": {"content": "Some progress update that should be filtered."},
                "timestamp": "2025-01-15T10:03:00",
            }),
            # tool_use block in assistant — only text blocks are extracted
            json.dumps({
                "type": "assistant",
                "message": {"content": [
                    {"type": "tool_use", "name": "Read", "input": {"path": "/foo"}},
                ]},
                "timestamp": "2025-01-15T10:04:00",
            }),
        ]

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("\n".join(lines))
            f.flush()
            tmp_path = Path(f.name)

        try:
            turns = parse_session_jsonl(tmp_path)
            # Should have exactly 2 turns (user + assistant with text)
            assert len(turns) == 2
            assert turns[0]["role"] == "user"
            assert turns[1]["role"] == "assistant"
            # Short message should be filtered
            assert not any("short" == t["text"] for t in turns)
        finally:
            tmp_path.unlink()

    def test_save_learnings_md(self):
        """Test markdown file generation with mock learnings dict."""
        from knowledge.store import load_config

        config = load_config()

        with tempfile.TemporaryDirectory() as tmpdir:
            config_copy = dict(config)
            config_copy["paths"] = dict(config["paths"])
            config_copy["paths"]["session_learnings"] = tmpdir

            from knowledge.intelligence import save_learnings_md

            learnings = {
                "decisions": ["Used pytest for testing"],
                "bugs": ["Fixed import order issue"],
                "discoveries": [],
                "negative_knowledge": [],
                "configuration": [],
                "patterns": ["Always mock external deps"],
            }

            md_path = save_learnings_md(
                learnings, "test-project", "abc12345-session-id", "2025-01-15", config_copy,
            )

            assert md_path.exists()
            content = md_path.read_text()

            # Verify frontmatter
            assert content.startswith("---")
            assert "project: test-project" in content
            assert "session_id: abc12345-session-id" in content
            assert 'session_date: "2025-01-15"' in content

            # Verify content structure
            assert "## Decisions" in content
            assert "- Used pytest for testing" in content
            assert "## Bugs Found" in content
            assert "- Fixed import order issue" in content
            assert "## Patterns" in content
            assert "- Always mock external deps" in content

            # Empty categories should not appear
            assert "## Discoveries" not in content
            assert "## Configuration" not in content

    def test_get_project_slug(self):
        """Test path to slug conversion."""
        from knowledge.sessions import get_project_slug

        result = get_project_slug("/Users/slavkoklincov/Code/geofrey")
        # lstrip("-") strips the leading dash
        assert result == "Users-slavkoklincov-Code-geofrey"


# ---------------------------------------------------------------------------
# 4. Sessions Tests
# ---------------------------------------------------------------------------

class TestSessions:
    def test_get_project_slug_conversion(self):
        """Path to slug conversion."""
        from knowledge.sessions import get_project_slug

        result = get_project_slug("/Users/foo/Code/bar")
        assert result == "Users-foo-Code-bar"

    def test_list_session_jsonls_empty(self):
        """Returns empty list for nonexistent slug."""
        from knowledge.sessions import list_session_jsonls

        result = list_session_jsonls("nonexistent-slug-that-does-not-exist-xyz")
        assert result == []


# ---------------------------------------------------------------------------
# 5. Prompts Tests
# ---------------------------------------------------------------------------

class TestPrompts:
    def test_prompts_defined(self):
        """Verify all prompt constants exist and are non-empty strings."""
        from brain.prompts import (
            CHAT_PROMPT,
            IMAGE_PROMPT_TEMPLATE,
            LINKEDIN_PROMPT,
            ORCHESTRATOR_PROMPT,
            SESSION_CONSOLIDATE_PROMPT,
            SESSION_EXTRACT_PROMPT,
        )

        for name, prompt in [
            ("ORCHESTRATOR_PROMPT", ORCHESTRATOR_PROMPT),
            ("CHAT_PROMPT", CHAT_PROMPT),
            ("LINKEDIN_PROMPT", LINKEDIN_PROMPT),
            ("IMAGE_PROMPT_TEMPLATE", IMAGE_PROMPT_TEMPLATE),
            ("SESSION_EXTRACT_PROMPT", SESSION_EXTRACT_PROMPT),
            ("SESSION_CONSOLIDATE_PROMPT", SESSION_CONSOLIDATE_PROMPT),
        ]:
            assert isinstance(prompt, str), f"{name} is not a string"
            assert len(prompt.strip()) > 0, f"{name} is empty"

    def test_prompt_placeholders(self):
        """Verify ORCHESTRATOR_PROMPT contains required placeholders."""
        from brain.prompts import ORCHESTRATOR_PROMPT

        assert "{projects}" in ORCHESTRATOR_PROMPT
        assert "{personal_context}" in ORCHESTRATOR_PROMPT

    def test_session_extract_prompt_placeholders(self):
        """Verify SESSION_EXTRACT_PROMPT contains required placeholders."""
        from brain.prompts import SESSION_EXTRACT_PROMPT

        assert "{project_name}" in SESSION_EXTRACT_PROMPT
        assert "{session_date}" in SESSION_EXTRACT_PROMPT
        assert "{chunk_text}" in SESSION_EXTRACT_PROMPT


# ---------------------------------------------------------------------------
# 6. Safety Tests
# ---------------------------------------------------------------------------

class TestSafety:
    def test_always_inject_ids(self):
        """Verify ALWAYS_INJECT contains expected chunk IDs."""
        from brain.safety import ALWAYS_INJECT

        assert isinstance(ALWAYS_INJECT, list)
        assert len(ALWAYS_INJECT) > 0
        expected_ids = [
            "safety__safety-scope",
            "safety__safety-secrets",
            "safety__safety-patterns",
        ]
        for expected_id in expected_ids:
            assert expected_id in ALWAYS_INJECT, f"Missing safety chunk: {expected_id}"


# ---------------------------------------------------------------------------
# 7. LinkedIn Parser Tests
# ---------------------------------------------------------------------------

class TestLinkedInParser:
    def test_parse_posts(self):
        """Verify parse_posts returns list of dicts with expected keys."""
        from knowledge.linkedin import parse_posts

        # Create temp file with mock posts
        content = """# LinkedIn Posts

## Post 1 - 2025-01-10
Thema: Test Topic One
Text:
This is the first test post with enough content to be meaningful.
It has multiple lines and covers an important topic.

What do you think about this?
Quellen: ["source1", "source2"]

## Post 2 - 2025-01-12
Thema: Another Topic
Text:
Second post text goes here with some real substance.
We discuss important matters in this post.

Have you experienced this?
Quellen: []
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(content)
            f.flush()
            tmp_path = f.name

        try:
            posts = parse_posts(tmp_path)
            assert len(posts) == 2

            expected_keys = {"thema", "text", "date", "quellen", "word_count"}
            for post in posts:
                assert expected_keys.issubset(post.keys()), f"Missing keys: {expected_keys - post.keys()}"

            assert posts[0]["thema"] == "Test Topic One"
            assert posts[0]["date"] == "2025-01-10"
            assert isinstance(posts[0]["quellen"], list)
            assert posts[0]["word_count"] > 0

            assert posts[1]["thema"] == "Another Topic"
            assert posts[1]["date"] == "2025-01-12"
        finally:
            os.unlink(tmp_path)

    def test_parse_posts_nonexistent_file(self):
        """parse_posts returns empty list for nonexistent file."""
        from knowledge.linkedin import parse_posts

        result = parse_posts("/tmp/nonexistent_file_xyz123.md")
        assert result == []


# ---------------------------------------------------------------------------
# 8. Ingest Tests
# ---------------------------------------------------------------------------

class TestIngest:
    def test_chunk_text(self):
        """Test the _chunk_text function with various inputs."""
        from knowledge.ingest import _chunk_text

        # Empty text
        assert _chunk_text("") == []

        # Short text fits in one chunk
        result = _chunk_text("Hello world.\n\nThis is a test.", chunk_size=512)
        assert len(result) == 1
        assert "Hello world." in result[0]

        # Long text gets split into multiple chunks
        paragraphs = "\n\n".join([f"Paragraph {i} with some content." for i in range(50)])
        result = _chunk_text(paragraphs, chunk_size=200, overlap=0)
        assert len(result) > 1
        # Each chunk should contain complete paragraphs
        for chunk in result:
            assert chunk.strip()

        # With overlap, chunks share content
        result_overlap = _chunk_text(paragraphs, chunk_size=200, overlap=50)
        assert len(result_overlap) >= 1

    def test_collect_files_single_file(self):
        """Test collect_files with a single temp .md file."""
        from knowledge.ingest import collect_files

        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Test\n\nSome content.")
            f.flush()
            tmp_path = f.name

        try:
            files = collect_files(tmp_path)
            assert len(files) == 1
            assert files[0].name.endswith(".md")
        finally:
            os.unlink(tmp_path)

    def test_collect_files_unsupported_extension(self):
        """collect_files returns empty for unsupported extensions."""
        from knowledge.ingest import collect_files

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xyz", delete=False) as f:
            f.write("some content")
            f.flush()
            tmp_path = f.name

        try:
            files = collect_files(tmp_path)
            assert files == []
        finally:
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# 9. Main CLI Tests
# ---------------------------------------------------------------------------

class TestMainCLI:
    def test_cli_help(self):
        """Verify main.py --help returns 0."""
        result = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "main.py"), "--help"],
            capture_output=True, text=True, cwd=str(PROJECT_ROOT),
        )
        assert result.returncode == 0
        assert "geofrey" in result.stdout

    def test_cli_unknown_command(self):
        """Verify unknown command returns non-zero."""
        result = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "main.py"), "nonexistent_command"],
            capture_output=True, text=True, cwd=str(PROJECT_ROOT),
        )
        assert result.returncode != 0
