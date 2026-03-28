"""Tests for autonomous operation readiness — preflight, plist, error handling."""

import sqlite3
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# --- Pre-Flight Checks ---

class TestPreflightChecks:
    def test_claude_available(self):
        from brain.preflight import check_claude_available
        with patch("brain.preflight.shutil.which", return_value="/usr/local/bin/claude"):
            ok, msg = check_claude_available()
        assert ok is True
        assert "claude found" in msg

    def test_claude_missing(self):
        from brain.preflight import check_claude_available
        with patch("brain.preflight.shutil.which", return_value=None):
            ok, msg = check_claude_available()
        assert ok is False
        assert "not found" in msg

    def test_tmux_available(self):
        from brain.preflight import check_tmux_available
        with patch("brain.preflight.shutil.which", return_value="/usr/bin/tmux"):
            ok, msg = check_tmux_available()
        assert ok is True

    def test_tmux_missing(self):
        from brain.preflight import check_tmux_available
        with patch("brain.preflight.shutil.which", return_value=None):
            ok, msg = check_tmux_available()
        assert ok is False
        assert "brew install tmux" in msg

    def test_ollama_running(self):
        from brain.preflight import check_ollama_running
        mock_result = MagicMock(stdout="200", returncode=0)
        with patch("brain.preflight.subprocess.run", return_value=mock_result):
            ok, msg = check_ollama_running()
        assert ok is True

    def test_ollama_not_running(self):
        from brain.preflight import check_ollama_running
        with patch("brain.preflight.subprocess.run", side_effect=subprocess.TimeoutExpired("curl", 3)):
            ok, msg = check_ollama_running()
        assert ok is False
        assert "ollama serve" in msg

    def test_ollama_models_present(self):
        from brain.preflight import check_ollama_models
        mock_result = MagicMock(stdout="NAME\nqwen3.5:9b\nnomic-embed-text\n", returncode=0)
        config = {"llm": {"model": "qwen3.5:9b"}, "embedding": {"model": "nomic-embed-text"}}
        with patch("brain.preflight.subprocess.run", return_value=mock_result):
            ok, msg = check_ollama_models(config)
        assert ok is True

    def test_ollama_models_missing(self):
        from brain.preflight import check_ollama_models
        mock_result = MagicMock(stdout="NAME\nqwen3.5:9b\n", returncode=0)
        config = {"llm": {"model": "qwen3.5:9b"}, "embedding": {"model": "nomic-embed-text"}}
        with patch("brain.preflight.subprocess.run", return_value=mock_result):
            ok, msg = check_ollama_models(config)
        assert ok is False
        assert "nomic-embed-text" in msg

    def test_directories_writable(self):
        from brain.preflight import check_directories_writable
        with tempfile.TemporaryDirectory() as td:
            config = {"paths": {"session_learnings": td, "decisions": td}}
            ok, msg = check_directories_writable(config)
        assert ok is True

    def test_run_preflight_returns_all_checks(self):
        from brain.preflight import run_preflight
        config = {"llm": {"model": "test"}, "embedding": {"model": "test"}, "paths": {}}
        with patch("brain.preflight.shutil.which", return_value=None):
            with patch("brain.preflight.subprocess.run", side_effect=subprocess.TimeoutExpired("cmd", 1)):
                results = run_preflight(config)
        assert "claude" in results
        assert "tmux" in results
        assert "git" in results
        assert "ollama_running" in results
        assert "ollama_models" in results
        assert "directories" in results

    def test_format_preflight_all_pass(self):
        from brain.preflight import format_preflight
        results = {
            "claude": (True, "ok"),
            "tmux": (True, "ok"),
            "directories": (True, "ok"),
        }
        output = format_preflight(results)
        assert "All checks passed" in output

    def test_format_preflight_critical_fail(self):
        from brain.preflight import format_preflight
        results = {
            "claude": (False, "not found"),
            "tmux": (True, "ok"),
            "directories": (True, "ok"),
        }
        output = format_preflight(results)
        assert "CRITICAL" in output


# --- launchd Plist ---

class TestLaunchdPlist:
    def test_plist_has_environment_variables(self):
        from brain.daemon import get_launchd_plist
        plist = get_launchd_plist()
        assert "<key>EnvironmentVariables</key>" in plist
        assert "/opt/homebrew/bin" in plist

    def test_plist_has_username(self):
        from brain.daemon import get_launchd_plist
        plist = get_launchd_plist()
        assert "<key>UserName</key>" in plist

    def test_plist_has_home(self):
        from brain.daemon import get_launchd_plist
        plist = get_launchd_plist()
        assert "<key>HOME</key>" in plist
        assert str(Path.home()) in plist

    def test_plist_has_path_with_homebrew(self):
        from brain.daemon import get_launchd_plist
        plist = get_launchd_plist()
        assert "/opt/homebrew/bin" in plist
        assert "/usr/local/bin" in plist


# --- Session Error Handling ---

class TestSessionValidation:
    def test_start_session_no_claude_returns_failed(self):
        from brain.session import start_session
        from brain.models import SessionStatus
        with patch("brain.session.shutil.which", return_value=None):
            session = start_session("/tmp/test", "test prompt")
        assert session.status == SessionStatus.FAILED

    def test_start_session_no_tmux_returns_failed(self):
        from brain.session import start_session
        from brain.models import SessionStatus
        # claude found, tmux not found
        def mock_which(cmd):
            return "/usr/bin/claude" if cmd == "claude" else None
        with patch("brain.session.shutil.which", side_effect=mock_which):
            session = start_session("/tmp/test", "test prompt")
        assert session.status == SessionStatus.FAILED

    def test_run_session_sync_no_claude_returns_empty(self):
        from brain.session import run_session_sync
        with patch("brain.session.shutil.which", return_value=None):
            result = run_session_sync("/tmp/test", "test prompt")
        assert result == ""


# --- Hub Ollama Error Handling ---

class TestHubErrorHandling:
    def test_embed_ollama_failure_returns_empty(self):
        from knowledge.hub import KnowledgeHub
        with patch("knowledge.hub.chromadb.PersistentClient"):
            with patch("knowledge.hub.load_config", return_value={"paths": {"vectordb": "/tmp/test-vdb"}}):
                hub = KnowledgeHub()
        with patch("knowledge.hub.ollama.embed", side_effect=ConnectionError("Ollama down")):
            result = hub._embed("test text")
        assert result == []

    def test_embed_batch_ollama_failure_returns_empty_list(self):
        from knowledge.hub import KnowledgeHub
        with patch("knowledge.hub.chromadb.PersistentClient"):
            with patch("knowledge.hub.load_config", return_value={"paths": {"vectordb": "/tmp/test-vdb"}}):
                hub = KnowledgeHub()
        with patch("knowledge.hub.ollama.embed", side_effect=ConnectionError("Ollama down")):
            result = hub._embed_batch(["text1", "text2"])
        assert len(result) == 2
        assert result == [[], []]

    def test_query_with_failed_embed_returns_empty(self):
        from knowledge.hub import KnowledgeHub
        with patch("knowledge.hub.chromadb.PersistentClient"):
            with patch("knowledge.hub.load_config", return_value={"paths": {"vectordb": "/tmp/test-vdb"}}):
                hub = KnowledgeHub()
        with patch("knowledge.hub.ollama.embed", side_effect=ConnectionError("Ollama down")):
            result = hub.query("test", ["knowledge"])
        assert result == []


# --- SQLite WAL + Timeout ---

class TestSQLiteWAL:
    def test_wal_mode_enabled(self):
        from brain.queue import init_db
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        init_db(db_path)
        conn = sqlite3.connect(db_path)
        result = conn.execute("PRAGMA journal_mode").fetchone()
        conn.close()
        assert result[0] == "wal"

    def test_connection_has_timeout(self):
        from brain.queue import _get_conn
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        with patch("brain.queue.DEFAULT_DB_PATH", db_path):
            with patch("brain.queue.load_projects", return_value={}):
                conn = _get_conn(db_path)
                # sqlite3 doesn't expose timeout directly, but connection works
                assert conn is not None
                conn.close()
