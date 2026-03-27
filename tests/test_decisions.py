"""Tests for Decision Dependency System."""

import json
import os
import re
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from brain.models import Decision, EnrichmentRule, ProjectContext


# --- Decision Dataclass ---

class TestDecisionModel:
    def test_decision_defaults(self):
        d = Decision(id="DEC-001", title="Use SQLite")
        assert d.status == "active"
        assert d.category == "architecture"
        assert d.scope == []
        assert d.keywords == []
        assert d.depends_on == []
        assert d.enables == []
        assert d.conflicts_with == []
        assert d.supersedes == []

    def test_decision_full(self):
        d = Decision(
            id="DEC-002",
            title="Safety in gates.py",
            status="active",
            date="2026-03-27",
            project="geofrey",
            category="architecture",
            description="Consolidated safety",
            rationale="Three disconnected systems",
            change_warning="Do not recreate safety.py",
            scope=["brain/gates.py"],
            keywords=["safety", "gates"],
            depends_on=["DEC-001"],
            enables=["DEC-003"],
        )
        assert d.change_warning == "Do not recreate safety.py"
        assert "DEC-001" in d.depends_on

    def test_project_context_has_decision_field(self):
        ctx = ProjectContext(project_name="test", project_path="/tmp")
        assert ctx.decision_context == ""

    def test_enrichment_rule_has_decision_flag(self):
        rule = EnrichmentRule(task_type="code-fix")
        assert rule.include_decision_context is True


# --- Decision File Parsing ---

class TestDecisionParsing:
    def _write_decision(self, tmpdir, filename, frontmatter, body=""):
        p = tmpdir / filename
        content = f"---\n{frontmatter}\n---\n{body}"
        p.write_text(content, encoding="utf-8")
        return p

    def test_parse_valid_decision(self):
        from knowledge.decisions import _parse_decision_file
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "DEC-001.md"
            p.write_text(
                "---\n"
                "id: DEC-001\n"
                "title: Use SQLite\n"
                "status: active\n"
                "category: tooling\n"
                "keywords: [sqlite, database]\n"
                "scope: [brain/queue.py]\n"
                "---\n"
                "## Rationale\nSimplicity over complexity.\n"
                "## Change Warning\nDo not switch to PostgreSQL.\n",
                encoding="utf-8",
            )
            dec = _parse_decision_file(p)
            assert dec is not None
            assert dec.id == "DEC-001"
            assert dec.title == "Use SQLite"
            assert dec.category == "tooling"
            assert "sqlite" in dec.keywords
            assert dec.rationale == "Simplicity over complexity."
            assert "PostgreSQL" in dec.change_warning

    def test_parse_no_frontmatter(self):
        from knowledge.decisions import _parse_decision_file
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "bad.md"
            p.write_text("Just some text without frontmatter.", encoding="utf-8")
            assert _parse_decision_file(p) is None

    def test_parse_csv_scope(self):
        from knowledge.decisions import _parse_decision_file
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "DEC-002.md"
            p.write_text(
                "---\n"
                "id: DEC-002\n"
                "title: Test\n"
                "scope: brain/foo.py, brain/bar.py\n"
                "---\n",
                encoding="utf-8",
            )
            dec = _parse_decision_file(p)
            assert len(dec.scope) == 2

    def test_load_decisions_from_files(self):
        from knowledge.decisions import load_decisions_from_files
        with tempfile.TemporaryDirectory() as td:
            proj_dir = Path(td) / "testproj"
            proj_dir.mkdir()
            (proj_dir / "DEC-001.md").write_text(
                "---\nid: DEC-001\ntitle: Decision One\n---\n",
                encoding="utf-8",
            )
            (proj_dir / "DEC-002.md").write_text(
                "---\nid: DEC-002\ntitle: Decision Two\n---\n",
                encoding="utf-8",
            )
            config = {"paths": {"decisions": td}}
            decs = load_decisions_from_files("testproj", config)
            assert len(decs) == 2

    def test_load_missing_project(self):
        from knowledge.decisions import load_decisions_from_files
        config = {"paths": {"decisions": "/nonexistent"}}
        assert load_decisions_from_files("nope", config) == []


# --- Dependency Walker ---

class TestDependencyWalker:
    def test_walk_simple_chain(self):
        from knowledge.decisions import walk_dependency_chain
        decs = [
            Decision(id="A", title="A", depends_on=["B"]),
            Decision(id="B", title="B", depends_on=["C"]),
            Decision(id="C", title="C"),
        ]
        chain = walk_dependency_chain("A", decs)
        ids = [d.id for d in chain]
        assert "A" in ids
        assert "B" in ids
        assert "C" in ids

    def test_walk_circular(self):
        from knowledge.decisions import walk_dependency_chain
        decs = [
            Decision(id="X", title="X", depends_on=["Y"]),
            Decision(id="Y", title="Y", depends_on=["X"]),
        ]
        chain = walk_dependency_chain("X", decs)
        assert len(chain) == 2  # no infinite loop

    def test_walk_missing_dep(self):
        from knowledge.decisions import walk_dependency_chain
        decs = [
            Decision(id="A", title="A", depends_on=["MISSING"]),
        ]
        chain = walk_dependency_chain("A", decs)
        assert len(chain) == 1

    def test_walk_enables(self):
        from knowledge.decisions import walk_dependency_chain
        decs = [
            Decision(id="A", title="A", enables=["B"]),
            Decision(id="B", title="B"),
        ]
        chain = walk_dependency_chain("A", decs)
        ids = [d.id for d in chain]
        assert "B" in ids

    def test_walk_depth_limit(self):
        from knowledge.decisions import walk_dependency_chain
        decs = [Decision(id=f"D{i}", title=f"D{i}", depends_on=[f"D{i+1}"]) for i in range(10)]
        chain = walk_dependency_chain("D0", decs, depth=3)
        assert len(chain) <= 3


# --- Scope Matching ---

class TestScopeMatching:
    def test_scope_match(self):
        from knowledge.decisions import query_decisions_by_scope
        with tempfile.TemporaryDirectory() as td:
            proj_dir = Path(td) / "proj"
            proj_dir.mkdir()
            (proj_dir / "DEC-001.md").write_text(
                "---\nid: DEC-001\ntitle: Safety\nstatus: active\nscope: [brain/gates.py]\n---\n",
                encoding="utf-8",
            )
            config = {"paths": {"decisions": td}}
            matched = query_decisions_by_scope(["brain/gates.py"], "proj", config)
            assert len(matched) == 1

    def test_scope_no_match(self):
        from knowledge.decisions import query_decisions_by_scope
        with tempfile.TemporaryDirectory() as td:
            proj_dir = Path(td) / "proj"
            proj_dir.mkdir()
            (proj_dir / "DEC-001.md").write_text(
                "---\nid: DEC-001\ntitle: Safety\nstatus: active\nscope: [brain/gates.py]\n---\n",
                encoding="utf-8",
            )
            config = {"paths": {"decisions": td}}
            matched = query_decisions_by_scope(["main.py"], "proj", config)
            assert len(matched) == 0


# --- Conflict Detection ---

class TestConflictDetection:
    def test_keyword_match(self):
        from brain.decision_checker import _keyword_match
        decs = [
            Decision(id="D1", title="Use SQLite", keywords=["sqlite", "database"]),
            Decision(id="D2", title="Other", keywords=["auth"]),
        ]
        matched = _keyword_match("switch database to postgres", decs)
        assert len(matched) == 1
        assert matched[0].id == "D1"

    def test_keyword_no_match(self):
        from brain.decision_checker import _keyword_match
        decs = [
            Decision(id="D1", title="Use SQLite", keywords=["sqlite", "database"]),
        ]
        assert _keyword_match("fix the login page", decs) == []

    def test_check_decision_conflicts_no_decisions(self):
        from brain.decision_checker import check_decision_conflicts
        config = {"paths": {"decisions": "/nonexistent"}}
        assert check_decision_conflicts("do stuff", "nope", [], config) == []

    def test_format_decision_context_empty(self):
        from brain.decision_checker import format_decision_context
        assert format_decision_context([], []) == ""

    def test_format_decision_context_with_conflicts(self):
        from brain.decision_checker import format_decision_context
        result = format_decision_context([], ["**DEC-001: Use SQLite** [tooling]\n  ⚠ WARNING: Do not switch"])
        assert "DEC-001" in result
        assert "Do NOT contradict" in result


# --- Enricher Integration ---

class TestEnricherIntegration:
    def test_rule_yaml_parses_decision_flag(self):
        from brain.enricher import _parse_rule_yaml
        data = {
            "task_type": "test",
            "include_decision_context": False,
        }
        rule = _parse_rule_yaml(data)
        assert rule.include_decision_context is False

    def test_rule_yaml_defaults_decision_true(self):
        from brain.enricher import _parse_rule_yaml
        rule = _parse_rule_yaml({"task_type": "test"})
        assert rule.include_decision_context is True

    def test_build_enriched_prompt_includes_decisions(self):
        from brain.enricher import _build_enriched_prompt
        ctx = ProjectContext(
            project_name="test",
            project_path="/tmp",
            decision_context="**DEC-001** Do not switch DB",
        )
        rule = EnrichmentRule(task_type="test", include_decision_context=True)
        result = _build_enriched_prompt("fix db", ctx, rule, "")
        assert "Active Decisions" in result
        assert "DEC-001" in result

    def test_build_enriched_prompt_skips_decisions_when_disabled(self):
        from brain.enricher import _build_enriched_prompt
        ctx = ProjectContext(
            project_name="test",
            project_path="/tmp",
            decision_context="**DEC-001** stuff",
        )
        rule = EnrichmentRule(task_type="test", include_decision_context=False)
        result = _build_enriched_prompt("fix db", ctx, rule, "")
        assert "Active Decisions" not in result

    def test_build_enriched_prompt_skips_empty_decisions(self):
        from brain.enricher import _build_enriched_prompt
        ctx = ProjectContext(project_name="test", project_path="/tmp")
        rule = EnrichmentRule(task_type="test", include_decision_context=True)
        result = _build_enriched_prompt("fix something", ctx, rule, "")
        assert "Active Decisions" not in result


# --- Intelligence: Structured Decision Saving ---

class TestDecisionSaving:
    def test_save_decision_files(self):
        from knowledge.intelligence import _save_decision_files
        with tempfile.TemporaryDirectory() as td:
            config = {"paths": {"decisions": td}}
            learnings = {
                "decisions": [
                    {
                        "title": "Use SQLite for queue",
                        "rationale": "Simplicity",
                        "category": "tooling",
                        "scope": ["brain/queue.py"],
                        "keywords": ["sqlite"],
                        "change_warning": "Do not switch to Postgres",
                    }
                ]
            }
            _save_decision_files(learnings, "testproj", "2026-03-27", config)
            proj_dir = Path(td) / "testproj"
            files = list(proj_dir.glob("*.md"))
            assert len(files) == 1
            content = files[0].read_text()
            assert "Use SQLite" in content
            assert "Do not switch to Postgres" in content

    def test_save_decision_files_skips_strings(self):
        from knowledge.intelligence import _save_decision_files
        with tempfile.TemporaryDirectory() as td:
            config = {"paths": {"decisions": td}}
            learnings = {"decisions": ["just a string"]}
            _save_decision_files(learnings, "proj", "2026-03-27", config)
            proj_dir = Path(td) / "proj"
            assert not proj_dir.exists() or len(list(proj_dir.glob("*.md"))) == 0

    def test_save_decision_files_no_duplicates(self):
        from knowledge.intelligence import _save_decision_files
        with tempfile.TemporaryDirectory() as td:
            config = {"paths": {"decisions": td}}
            learnings = {
                "decisions": [{"title": "Test", "rationale": "Why"}]
            }
            _save_decision_files(learnings, "proj", "2026-03-27", config)
            _save_decision_files(learnings, "proj", "2026-03-27", config)
            files = list((Path(td) / "proj").glob("*.md"))
            assert len(files) == 1  # no duplicate


# --- CLI ---

class TestDecisionsCLI:
    def test_decisions_list_no_decisions(self, capsys):
        from main import main
        with patch("sys.argv", ["main", "decisions", "list"]):
            with patch("knowledge.store.load_config", return_value={"paths": {"decisions": "/nonexistent", "vectordb": "/tmp/test-vectordb"}}):
                main()
        captured = capsys.readouterr()
        assert "No decisions" in captured.out
