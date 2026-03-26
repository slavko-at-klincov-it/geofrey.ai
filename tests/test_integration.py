#!/usr/bin/env python3
"""Comprehensive integration tests for geofrey — tests ALL LLM integration points.

Standalone script (not pytest). Tests real Ollama calls, ChromaDB, SQLite, templates,
enrichment pipeline, and intelligence pipeline with actual LLM responses.

Run with: python3 tests/test_integration.py
"""

import json
import os
import shutil
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

GEOFREY_ROOT = str(PROJECT_ROOT)


# ---------------------------------------------------------------------------
# Test Harness
# ---------------------------------------------------------------------------

@dataclass
class TestResult:
    name: str
    phase: int
    passed: bool
    duration: float
    detail: str = ""
    response_preview: str = ""


class TestRunner:
    def __init__(self):
        self.results: list[TestResult] = []
        self.config: dict = {}
        self.temp_dir = tempfile.mkdtemp(prefix="geofrey_test_")
        self.temp_db = os.path.join(self.temp_dir, "test_tasks.db")
        self.temp_vectordb = os.path.join(self.temp_dir, "vectordb")
        self.temp_learnings = os.path.join(self.temp_dir, "learnings")
        self.ollama_ok = False
        self.phase = 0

    def run_test(self, name: str, fn, skip_if_no_ollama: bool = False):
        if skip_if_no_ollama and not self.ollama_ok:
            self.results.append(TestResult(
                name=name, phase=self.phase, passed=True,
                duration=0, detail="SKIPPED (Ollama not available)",
            ))
            self._print_result(self.results[-1], skipped=True)
            return

        start = time.time()
        try:
            fn()
            duration = time.time() - start
            result = TestResult(name=name, phase=self.phase, passed=True, duration=duration)
            self.results.append(result)
            self._print_result(result)
        except Exception as e:
            duration = time.time() - start
            result = TestResult(
                name=name, phase=self.phase, passed=False,
                duration=duration, detail=f"{type(e).__name__}: {e}",
            )
            self.results.append(result)
            self._print_result(result)

    def _print_result(self, r: TestResult, skipped: bool = False):
        tag = "SKIP" if skipped else ("PASS" if r.passed else "FAIL")
        color = "\033[90m" if skipped else ("\033[32m" if r.passed else "\033[31m")
        reset = "\033[0m"
        dots = "." * max(1, 55 - len(r.name))
        print(f"  [Phase {r.phase}] {r.name} {dots} {color}{tag}{reset} ({r.duration:.3f}s)")
        if r.detail and not r.passed:
            print(f"           {r.detail}")
        if r.response_preview:
            print(f"           Response: {r.response_preview[:200]}")

    def print_summary(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed and "SKIPPED" not in r.detail)
        skipped = sum(1 for r in self.results if "SKIPPED" in r.detail)
        failed = total - passed - skipped
        duration = sum(r.duration for r in self.results)

        border = "=" * 60
        print(f"\n{border}")
        print("  geofrey Integration Test Results")
        print(f"{border}")
        print(f"  Total:   {total}")
        print(f"  Passed:  {passed}")
        print(f"  Failed:  {failed}")
        print(f"  Skipped: {skipped}")
        print(f"  Duration: {duration:.1f}s")

        failures = [r for r in self.results if not r.passed and "SKIPPED" not in r.detail]
        if failures:
            print(f"\n  FAILURES:")
            for r in failures:
                print(f"    [Phase {r.phase}] {r.name}: {r.detail}")

        print(f"{border}\n")
        return len(failures) == 0

    def cleanup(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Test Data
# ---------------------------------------------------------------------------

SAMPLE_SESSION_JSONL = """{"type":"user","message":{"content":"Fix the login bug in auth.py — users get logged out after token expiry"},"timestamp":1711500000000}
{"type":"assistant","message":{"content":[{"type":"text","text":"I found the issue in auth.py. The session token was not being refreshed after expiry. The middleware checks token validity but doesn't call refresh_token() when it expires. I'll add the refresh logic now."}]},"timestamp":1711500010000}
{"type":"progress","content":"Reading auth.py...","timestamp":1711500005000}
{"type":"user","message":{"content":"Good, also check if there are tests for this"},"timestamp":1711500020000}
{"type":"assistant","message":{"content":[{"type":"text","text":"I checked test_auth.py and found it was missing edge cases for expired tokens. I've added 3 new test cases: test_token_refresh_on_expiry, test_expired_token_redirect, and test_concurrent_refresh_race_condition. All tests pass now. The root cause was that refresh_token() was only called in the login flow, not in the middleware."}]},"timestamp":1711500030000}
{"type":"file-history-snapshot","files":["auth.py","test_auth.py"],"timestamp":1711500035000}
"""

SAMPLE_CONVERSATION_CHUNK = """[USER] Fix the login bug in auth.py — users get logged out after token expiry

[ASSISTANT] I found the issue in auth.py. The session token was not being refreshed after expiry. The middleware checks token validity but doesn't call refresh_token() when it expires. I added the refresh logic. Root cause: refresh_token() was only called in login flow, not middleware. Also added 3 test cases for expired token scenarios."""

SAMPLE_MERGED_LEARNINGS = {
    "decisions": ["Use SQLite for task queue", "Use SQLite for the task queue storage"],
    "bugs": ["Session token not refreshed after expiry", "Token expiry bug — middleware missing refresh call"],
    "discoveries": ["nomic-embed-text produces 768-dim vectors", "ChromaDB cosine distance works well"],
    "negative_knowledge": ["Don't use langchain — too heavy for this use case"],
    "configuration": ["Qwen3.5 needs think=False always"],
    "patterns": ["Map-reduce works well for session extraction"],
}


# ---------------------------------------------------------------------------
# Phase 0: Prerequisites
# ---------------------------------------------------------------------------

def run_phase_0(runner: TestRunner):
    runner.phase = 0
    print("\n--- Phase 0: Prerequisites ---")

    def test_ollama_running():
        req = urllib.request.Request("http://localhost:11434/api/tags")
        resp = urllib.request.urlopen(req, timeout=5)
        assert resp.status == 200, f"Ollama returned {resp.status}"
        data = json.loads(resp.read())
        assert "models" in data, "No models key in response"
        runner.ollama_ok = True

    def test_model_qwen():
        import ollama
        info = ollama.show("qwen3.5:9b")
        assert info is not None, "qwen3.5:9b not found"

    def test_model_nomic():
        import ollama
        info = ollama.show("nomic-embed-text")
        assert info is not None, "nomic-embed-text not found"

    def test_config_loads():
        from knowledge.store import load_config
        config = load_config()
        assert "llm" in config, "Missing 'llm' in config"
        assert "embedding" in config, "Missing 'embedding' in config"
        assert config["llm"]["model"] == "qwen3.5:9b", f"Expected qwen3.5:9b, got {config['llm']['model']}"
        runner.config = config

    runner.run_test("ollama_running", test_ollama_running)
    runner.run_test("model_qwen_loaded", test_model_qwen, skip_if_no_ollama=True)
    runner.run_test("model_nomic_loaded", test_model_nomic, skip_if_no_ollama=True)
    runner.run_test("config_loads", test_config_loads)


# ---------------------------------------------------------------------------
# Phase 1: Config & Templates
# ---------------------------------------------------------------------------

def run_phase_1(runner: TestRunner):
    runner.phase = 1
    print("\n--- Phase 1: Config & Templates ---")

    def test_all_templates_load():
        from brain.prompts import load_template
        templates = ["orchestrator", "chat", "linkedin", "image", "session-extract", "session-consolidate"]
        for name in templates:
            t = load_template(name)
            assert len(t) > 50, f"Template '{name}' too short ({len(t)} chars)"
        # Check placeholders in session-extract
        se = load_template("session-extract")
        assert "{{project_name}}" in se, "session-extract missing {{project_name}}"
        assert "{{chunk_text}}" in se, "session-extract missing {{chunk_text}}"

    def test_all_rules_load():
        from brain.enricher import load_enrichment_rules
        rules = load_enrichment_rules()
        expected = {"code-fix", "feature", "refactor", "review", "research", "security", "doc-sync"}
        assert expected.issubset(set(rules.keys())), f"Missing rules: {expected - set(rules.keys())}"

    def test_all_skills_exist():
        from brain.router import list_skills
        skills = list_skills()
        assert len(skills) >= 7, f"Expected >= 7 skills, got {len(skills)}"

    def test_projects_yaml():
        from brain.orchestrator import load_projects
        projects = load_projects()
        assert "geofrey" in projects, "geofrey not in projects.yaml"
        assert "path" in projects["geofrey"], "geofrey missing path"

    runner.run_test("all_templates_load", test_all_templates_load)
    runner.run_test("all_rules_load", test_all_rules_load)
    runner.run_test("all_skills_exist", test_all_skills_exist)
    runner.run_test("projects_yaml_loads", test_projects_yaml)


# ---------------------------------------------------------------------------
# Phase 2: Deterministic Pipeline
# ---------------------------------------------------------------------------

def run_phase_2(runner: TestRunner):
    runner.phase = 2
    print("\n--- Phase 2: Deterministic Pipeline ---")

    # --- Router ---
    def test_router_all_types():
        from brain.router import TASK_KEYWORDS, detect_task_type
        for task_type, keywords in TASK_KEYWORDS.items():
            result = detect_task_type(keywords[0])
            assert result == task_type, f"'{keywords[0]}' → '{result}', expected '{task_type}'"

    def test_router_german():
        from brain.router import detect_task_type
        cases = {
            "fehler beheben": "code-fix",
            "erstelle neues Feature": "feature",
            "dokumentation aktualisieren": "doc-sync",
            "sicherheit audit durchführen": "security",
            "code aufräumen": "refactor",
        }
        for inp, expected in cases.items():
            result = detect_task_type(inp)
            assert result == expected, f"'{inp}' → '{result}', expected '{expected}'"

    def test_router_fallback():
        from brain.router import detect_task_type
        assert detect_task_type("xyz random gibberish") == "code-fix"

    def test_skill_meta_all():
        from brain.router import get_skill_meta
        config = runner.config or {}
        for skill in ["code-fix", "feature", "refactor", "review", "research", "security", "doc-sync"]:
            meta = get_skill_meta(skill, config)
            assert meta.name == skill
            assert meta.max_budget_usd > 0
            assert meta.max_turns > 0

    def test_skill_templates():
        from brain.router import get_skill_template
        for skill in ["code-fix", "feature", "refactor", "review", "research", "security", "doc-sync"]:
            t = get_skill_template(skill)
            assert len(t) > 20, f"Skill template '{skill}' too short"

    # --- Gates ---
    def test_gates_clean():
        from brain.gates import validate_prompt
        assert validate_prompt("Refactor the auth module") == []

    def test_gates_dangerous():
        from brain.gates import validate_prompt
        dangerous = ["rm -rf", "drop table", "force push", "--force", "git reset --hard", "git clean -f"]
        for pattern in dangerous:
            issues = validate_prompt(f"Please {pattern} the old data")
            assert len(issues) >= 1, f"No warning for '{pattern}'"

    def test_gates_secrets():
        from brain.gates import validate_prompt
        secrets = ["password", "api_key", "api-key", "secret_key", "access_token"]
        for pattern in secrets:
            issues = validate_prompt(f"Set {pattern} to value")
            assert len(issues) >= 1, f"No warning for '{pattern}'"

    def test_gates_blockers():
        from brain.gates import has_blockers
        assert has_blockers(["[BLOCK] bad"]) is True
        assert has_blockers(["[WARN] ok"]) is False
        assert has_blockers([]) is False

    # --- Scope ---
    def test_scope_detection():
        from brain.scope import detect_scope
        cases = {
            "brain/router.py": "backend",
            "tests/test_new.py": "tests",
            "docs/vision.md": "docs",
            "config/config.yaml": "config",
            "scripts/embed.py": "scripts",
        }
        for path, expected in cases.items():
            result = detect_scope(path)
            assert result == expected, f"'{path}' → '{result}', expected '{expected}'"

    def test_scope_real_repo():
        from brain.scope import detect_diff_scopes
        scopes = detect_diff_scopes(GEOFREY_ROOT)
        assert isinstance(scopes, dict)

    def test_scope_summary():
        from brain.scope import scope_summary
        result = scope_summary({"backend": ["a.py", "b.py"], "tests": ["t.py"]})
        assert "backend: 2 files" in result
        assert "tests: 1 files" in result
        assert scope_summary({}) == ""

    # --- Context Gatherer ---
    def test_context_real_repo():
        from brain.context_gatherer import gather_project_context
        with patch("brain.context_gatherer._query_chromadb", return_value=""):
            ctx = gather_project_context(GEOFREY_ROOT, "geofrey", config={})
        assert ctx.git_branch != "", "Branch should not be empty"
        assert ctx.claude_md != "", "CLAUDE.md should exist"

    def test_context_nonexistent():
        from brain.context_gatherer import gather_project_context
        with patch("brain.context_gatherer._query_chromadb", return_value=""):
            ctx = gather_project_context("/tmp/nonexistent_xyz", "fake", config={})
        assert ctx.git_branch == ""
        assert ctx.claude_md == ""

    def test_context_dach():
        from brain.context_gatherer import gather_dach_context
        with patch("brain.context_gatherer._query_chromadb", return_value="DACH context data"):
            result = gather_dach_context(config={})
        assert result == "DACH context data"

    # --- Enricher ---
    def test_enrich_code_fix():
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext
        with patch("brain.enricher.gather_project_context") as mock_ctx, \
             patch("brain.enricher.gather_dach_context", return_value=""):
            mock_ctx.return_value = ProjectContext(
                project_name="geofrey", project_path=GEOFREY_ROOT,
                git_branch="main", git_status="M file.py",
            )
            result = enrich_prompt("fix login crash", "geofrey", GEOFREY_ROOT, "code-fix", {})
        assert "fix login crash" in result.enriched_prompt
        assert result.task_type == "code-fix"
        assert len(result.post_actions) > 0

    def test_enrich_feature():
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext
        with patch("brain.enricher.gather_project_context") as mock_ctx, \
             patch("brain.enricher.gather_dach_context", return_value=""):
            mock_ctx.return_value = ProjectContext(
                project_name="geofrey", project_path=GEOFREY_ROOT,
                architecture="Three Pillars Architecture",
            )
            result = enrich_prompt("add user auth", "geofrey", GEOFREY_ROOT, "feature", {})
        assert "Three Pillars" in result.enriched_prompt

    def test_enrich_research_no_git():
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext
        with patch("brain.enricher.gather_project_context") as mock_ctx, \
             patch("brain.enricher.gather_dach_context", return_value=""):
            mock_ctx.return_value = ProjectContext(
                project_name="geofrey", project_path=GEOFREY_ROOT,
                git_branch="feature/test", git_status="M file.py",
            )
            result = enrich_prompt("research DSGVO", "geofrey", GEOFREY_ROOT, "research", {})
        assert "feature/test" not in result.enriched_prompt

    def test_enrich_security_dach():
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext
        with patch("brain.enricher.gather_project_context") as mock_ctx, \
             patch("brain.enricher.gather_dach_context", return_value="DSGVO relevant info"):
            mock_ctx.return_value = ProjectContext(project_name="geofrey", project_path=GEOFREY_ROOT)
            result = enrich_prompt("security audit", "geofrey", GEOFREY_ROOT, "security", {})
        assert "DSGVO" in result.enriched_prompt

    def test_enrich_amplification():
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext
        with patch("brain.enricher.gather_project_context") as mock_ctx, \
             patch("brain.enricher.gather_dach_context", return_value=""):
            mock_ctx.return_value = ProjectContext(
                project_name="geofrey", project_path=GEOFREY_ROOT,
                git_branch="main", git_status="M file.py",
                recent_commits="abc1234 fix: something",
                claude_md="# geofrey project",
            )
            result = enrich_prompt("fix login in meus", "geofrey", GEOFREY_ROOT, "code-fix", {})
        ratio = len(result.enriched_prompt) / len("fix login in meus")
        assert ratio > 2, f"Amplification ratio {ratio:.1f}x too low"

    runner.run_test("router_all_types", test_router_all_types)
    runner.run_test("router_german", test_router_german)
    runner.run_test("router_fallback", test_router_fallback)
    runner.run_test("skill_meta_all", test_skill_meta_all)
    runner.run_test("skill_templates", test_skill_templates)
    runner.run_test("gates_clean", test_gates_clean)
    runner.run_test("gates_dangerous", test_gates_dangerous)
    runner.run_test("gates_secrets", test_gates_secrets)
    runner.run_test("gates_blockers", test_gates_blockers)
    runner.run_test("scope_detection", test_scope_detection)
    runner.run_test("scope_real_repo", test_scope_real_repo)
    runner.run_test("scope_summary", test_scope_summary)
    runner.run_test("context_real_repo", test_context_real_repo)
    runner.run_test("context_nonexistent", test_context_nonexistent)
    runner.run_test("context_dach", test_context_dach)
    runner.run_test("enrich_code_fix", test_enrich_code_fix)
    runner.run_test("enrich_feature", test_enrich_feature)
    runner.run_test("enrich_research_no_git", test_enrich_research_no_git)
    runner.run_test("enrich_security_dach", test_enrich_security_dach)
    runner.run_test("enrich_amplification", test_enrich_amplification)


# ---------------------------------------------------------------------------
# Phase 3: Embedding Pipeline (real Ollama)
# ---------------------------------------------------------------------------

def run_phase_3(runner: TestRunner):
    runner.phase = 3
    print("\n--- Phase 3: Embedding Pipeline (real Ollama) ---")

    def test_embed_single():
        import ollama
        resp = ollama.embed(model="nomic-embed-text", input="Test embedding text")
        emb = resp["embeddings"][0]
        assert isinstance(emb, list), "Embedding should be a list"
        assert len(emb) == 768, f"Expected 768 dims, got {len(emb)}"
        assert all(isinstance(x, float) for x in emb[:10])

    def test_embed_batch():
        import ollama
        resp = ollama.embed(model="nomic-embed-text", input=["Text one", "Text two", "Text three"])
        assert len(resp["embeddings"]) == 3
        for emb in resp["embeddings"]:
            assert len(emb) == 768

    def test_embed_consistency():
        import ollama
        texts = ["Hi", "A medium length test sentence for embedding", "A" * 2000]
        resp = ollama.embed(model="nomic-embed-text", input=texts)
        dims = set(len(e) for e in resp["embeddings"])
        assert len(dims) == 1, f"Inconsistent dimensions: {dims}"

    def test_chromadb_crud():
        import chromadb
        import ollama
        client = chromadb.PersistentClient(path=runner.temp_vectordb)
        col = client.get_or_create_collection("test_crud", metadata={"hnsw:space": "cosine"})

        texts = ["Python is great", "JavaScript is popular", "Rust is fast"]
        resp = ollama.embed(model="nomic-embed-text", input=texts)
        col.upsert(
            ids=["d1", "d2", "d3"],
            documents=texts,
            embeddings=resp["embeddings"],
            metadatas=[{"lang": "python"}, {"lang": "javascript"}, {"lang": "rust"}],
        )
        assert col.count() == 3

        q = ollama.embed(model="nomic-embed-text", input="programming language")
        results = col.query(query_embeddings=[q["embeddings"][0]], n_results=3)
        assert len(results["documents"][0]) == 3

        col.delete(ids=["d3"])
        assert col.count() == 2

    def test_chromadb_similarity():
        import chromadb
        import ollama
        client = chromadb.PersistentClient(path=runner.temp_vectordb)
        col = client.get_or_create_collection("test_similarity", metadata={"hnsw:space": "cosine"})

        texts = ["Python programming language for data science", "JavaScript React frontend framework"]
        resp = ollama.embed(model="nomic-embed-text", input=texts)
        col.upsert(ids=["py", "js"], documents=texts, embeddings=resp["embeddings"])

        query_emb = ollama.embed(model="nomic-embed-text", input="Python code")["embeddings"][0]
        results = col.query(query_embeddings=[query_emb], n_results=2)
        assert results["ids"][0][0] == "py", f"Expected Python first, got {results['ids'][0]}"

    def test_knowledge_hub():
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub(db_path=runner.temp_vectordb)
        chunk_id = hub.ingest_text("Python is a versatile programming language", "test_hub_col")
        assert chunk_id is not None

        results = hub.query("Python", collections=["test_hub_col"], top_k=1)
        assert len(results) >= 1
        assert "Python" in results[0]["text"]

    runner.run_test("embed_single", test_embed_single, skip_if_no_ollama=True)
    runner.run_test("embed_batch", test_embed_batch, skip_if_no_ollama=True)
    runner.run_test("embed_consistency", test_embed_consistency, skip_if_no_ollama=True)
    runner.run_test("chromadb_crud", test_chromadb_crud, skip_if_no_ollama=True)
    runner.run_test("chromadb_similarity", test_chromadb_similarity, skip_if_no_ollama=True)
    runner.run_test("knowledge_hub", test_knowledge_hub, skip_if_no_ollama=True)


# ---------------------------------------------------------------------------
# Phase 4: Qwen3.5 Chat (real LLM)
# ---------------------------------------------------------------------------

def run_phase_4(runner: TestRunner):
    runner.phase = 4
    print("\n--- Phase 4: Qwen3.5 Chat (real LLM) ---")

    def test_qwen_basic():
        import ollama
        resp = ollama.chat(
            model="qwen3.5:9b",
            messages=[{"role": "user", "content": "What is 2+2? Answer with just the number."}],
            think=False,
        )
        answer = resp["message"]["content"].strip()
        assert "4" in answer, f"Expected '4' in response, got: {answer}"
        print(f"           Qwen response: {answer[:100]}")

    def test_qwen_json_output():
        import ollama
        resp = ollama.chat(
            model="qwen3.5:9b",
            messages=[{"role": "user", "content": 'Return a JSON object with keys "name" and "age". Example: {"name": "test", "age": 25}. Return ONLY valid JSON, nothing else.'}],
            think=False,
        )
        text = resp["message"]["content"].strip()
        from knowledge.intelligence import _parse_llm_json
        parsed = _parse_llm_json(text)
        assert "name" in parsed, f"No 'name' key in parsed JSON. Raw: {text[:200]}"
        print(f"           Parsed JSON: {parsed}")

    def test_extract_learnings_real():
        from knowledge.intelligence import extract_learnings_chunk
        config = runner.config
        result = extract_learnings_chunk(SAMPLE_CONVERSATION_CHUNK, "test-project", "2026-03-26", config)
        assert isinstance(result, dict), f"Expected dict, got {type(result)}"
        categories = ["decisions", "bugs", "discoveries", "negative_knowledge", "configuration", "patterns"]
        has_items = sum(1 for cat in categories if result.get(cat))
        assert has_items >= 1, f"No categories with items. Result: {result}"
        print(f"           Learnings: {json.dumps(result, indent=2, ensure_ascii=False)[:300]}")

    def test_consolidate_real():
        from knowledge.intelligence import _llm_consolidate
        config = runner.config
        result = _llm_consolidate(SAMPLE_MERGED_LEARNINGS, "test-project", "2026-03-26", config)
        assert isinstance(result, dict), f"Expected dict, got {type(result)}"
        # Should have reduced duplicates
        input_total = sum(len(v) for v in SAMPLE_MERGED_LEARNINGS.values())
        output_total = sum(len(v) for v in result.values() if isinstance(v, list))
        print(f"           Consolidation: {input_total} items → {output_total} items")

    def test_generate_post_real():
        from brain.linkedin import generate_post
        config = runner.config
        post = generate_post("KI-Sicherheit in der DACH-Region", config)
        assert isinstance(post, str), f"Expected str, got {type(post)}"
        word_count = len(post.split())
        assert word_count >= 30, f"Post too short: {word_count} words"
        german_words = ["der", "die", "das", "und", "ist", "für", "mit", "ein", "von", "auf"]
        has_german = any(w in post.lower() for w in german_words)
        assert has_german, f"Post doesn't appear to be in German"
        print(f"           Post ({word_count} words): {post[:200]}...")

    def test_think_false_timing():
        import ollama
        start = time.time()
        ollama.chat(
            model="qwen3.5:9b",
            messages=[{"role": "user", "content": "Explain in one sentence what Python is."}],
            think=False,
        )
        duration = time.time() - start
        assert duration < 60, f"Call took {duration:.1f}s — think mode may be enabled"
        print(f"           think=False call took {duration:.1f}s")

    runner.run_test("qwen_basic_chat", test_qwen_basic, skip_if_no_ollama=True)
    runner.run_test("qwen_json_output", test_qwen_json_output, skip_if_no_ollama=True)
    runner.run_test("extract_learnings_real", test_extract_learnings_real, skip_if_no_ollama=True)
    runner.run_test("consolidate_real", test_consolidate_real, skip_if_no_ollama=True)
    runner.run_test("generate_post_real", test_generate_post_real, skip_if_no_ollama=True)
    runner.run_test("think_false_timing", test_think_false_timing, skip_if_no_ollama=True)


# ---------------------------------------------------------------------------
# Phase 5: Queue + Briefing (temp SQLite)
# ---------------------------------------------------------------------------

def run_phase_5(runner: TestRunner):
    runner.phase = 5
    print("\n--- Phase 5: Queue + Briefing ---")

    def test_init_db():
        from brain.queue import init_db
        init_db(runner.temp_db)
        assert Path(runner.temp_db).exists()

    def test_add_and_get():
        from brain.queue import add_task, get_task
        with patch("brain.queue.load_projects", return_value={}):
            task = add_task("Write unit tests", db_path=runner.temp_db)
        retrieved = get_task(task.id, db_path=runner.temp_db)
        assert retrieved is not None
        assert retrieved.description == "Write unit tests"
        assert retrieved.status.value == "pending"

    def test_priority_ordering():
        from brain.models import TaskPriority
        from brain.queue import add_task, get_pending_tasks
        with patch("brain.queue.load_projects", return_value={}):
            add_task("Low task", db_path=runner.temp_db, priority=TaskPriority.LOW.value)
            add_task("Urgent task", db_path=runner.temp_db, priority=TaskPriority.URGENT.value)
            add_task("Normal task", db_path=runner.temp_db, priority=TaskPriority.NORMAL.value)
        pending = get_pending_tasks(db_path=runner.temp_db)
        assert pending[0].priority == TaskPriority.URGENT

    def test_status_transitions():
        from brain.models import TaskStatus
        from brain.queue import add_task, update_task
        with patch("brain.queue.load_projects", return_value={}):
            task = add_task("Transition test", db_path=runner.temp_db)
        updated = update_task(task.id, db_path=runner.temp_db, status=TaskStatus.RUNNING)
        assert updated.status == TaskStatus.RUNNING
        assert updated.started_at is not None
        done = update_task(task.id, db_path=runner.temp_db, status=TaskStatus.DONE, result="All good")
        assert done.completed_at is not None
        assert done.result == "All good"

    def test_failed_task():
        from brain.models import TaskStatus
        from brain.queue import add_task, update_task
        with patch("brain.queue.load_projects", return_value={}):
            task = add_task("Fail test", db_path=runner.temp_db)
        failed = update_task(task.id, db_path=runner.temp_db, status=TaskStatus.FAILED, error="Boom")
        assert failed.error == "Boom"
        assert failed.completed_at is not None

    def test_needs_input():
        from brain.models import TaskStatus
        from brain.queue import add_task, get_task, update_task
        with patch("brain.queue.load_projects", return_value={}):
            task = add_task("Input test", db_path=runner.temp_db)
        update_task(task.id, db_path=runner.temp_db, status=TaskStatus.NEEDS_INPUT, questions=["Which env?", "What version?"])
        retrieved = get_task(task.id, db_path=runner.temp_db)
        assert retrieved.questions == ["Which env?", "What version?"]

    def test_overnight_summary():
        from brain.queue import get_overnight_summary
        summary = get_overnight_summary(db_path=runner.temp_db)
        assert isinstance(summary, dict)
        assert "done" in summary
        assert "failed" in summary
        assert isinstance(summary.get("tasks_done", []), list)

    def test_generate_briefing():
        from brain.briefing import generate_briefing
        from brain.models import Task, TaskStatus
        done_task = Task(id="t1", description="Fixed bug", status=TaskStatus.DONE, result="Fixed commit abc123.", project="geofrey")
        failed_task = Task(id="t2", description="Deploy", status=TaskStatus.FAILED, error="Timeout", project="geofrey")
        summary = {
            "done": 1, "failed": 1, "needs_input": 0, "pending": 0, "running": 0,
            "tasks_done": [done_task], "tasks_failed": [failed_task],
            "tasks_needs_input": [], "tasks_pending": [], "tasks_running": [],
        }
        with patch("brain.briefing.get_overnight_summary", return_value=summary), \
             patch("brain.briefing.load_config", return_value={}):
            briefing = generate_briefing(config={})
        assert len(briefing.done) == 2  # 1 done + 1 failed
        assert any("commit" in item.details.lower() for item in briefing.done)

    def test_format_briefing():
        from brain.briefing import format_briefing
        from brain.models import BriefingItem, MorningBriefing
        briefing = MorningBriefing(
            done=[BriefingItem(category="done", title="Tests written", details="24 tests pass")],
            needs_input=[BriefingItem(category="input", title="Need key", details="Which provider?")],
            project_status=[BriefingItem(category="status", title="geofrey", details="1 erledigt")],
        )
        text = format_briefing(briefing)
        assert "geofrey" in text
        assert "Erledigt" in text
        assert "Brauche Input" in text
        assert "Projekt-Status" in text

    runner.run_test("init_db", test_init_db)
    runner.run_test("add_and_get", test_add_and_get)
    runner.run_test("priority_ordering", test_priority_ordering)
    runner.run_test("status_transitions", test_status_transitions)
    runner.run_test("failed_task", test_failed_task)
    runner.run_test("needs_input", test_needs_input)
    runner.run_test("overnight_summary", test_overnight_summary)
    runner.run_test("generate_briefing", test_generate_briefing)
    runner.run_test("format_briefing", test_format_briefing)


# ---------------------------------------------------------------------------
# Phase 6: Full Pipeline Integration
# ---------------------------------------------------------------------------

def run_phase_6(runner: TestRunner):
    runner.phase = 6
    print("\n--- Phase 6: Full Pipeline Integration ---")

    def test_full_code_fix():
        from brain.command import CommandSpec, build_command, resolve_model
        from brain.enricher import enrich_prompt
        from brain.gates import has_blockers, validate_prompt
        from brain.models import ProjectContext
        from brain.router import detect_task_type, get_skill_meta

        user_input = "fix login in geofrey"
        task_type = detect_task_type(user_input)
        assert task_type == "code-fix"

        config = runner.config or {}
        skill_meta = get_skill_meta(task_type, config)
        model = resolve_model(skill_meta.model_category, config)
        assert model == "opus"

        with patch("brain.enricher.gather_project_context") as mock_ctx, \
             patch("brain.enricher.gather_dach_context", return_value=""):
            mock_ctx.return_value = ProjectContext(
                project_name="geofrey", project_path=GEOFREY_ROOT,
                git_branch="main", git_status="M brain/router.py",
            )
            enriched = enrich_prompt(user_input, "geofrey", GEOFREY_ROOT, task_type, config)

        issues = validate_prompt(enriched.enriched_prompt)
        assert not has_blockers(issues)

        spec = CommandSpec(
            prompt=enriched.enriched_prompt, project_path=GEOFREY_ROOT,
            model=model, max_turns=skill_meta.max_turns,
            max_budget_usd=skill_meta.max_budget_usd,
        )
        cmd = build_command(spec)
        assert cmd.startswith("claude")
        assert "--cwd" in cmd
        ratio = len(enriched.enriched_prompt) / len(user_input)
        print(f"           {len(user_input)} chars → {len(enriched.enriched_prompt)} chars ({ratio:.0f}x)")

    def test_full_research():
        from brain.command import resolve_model
        from brain.router import detect_task_type, get_skill_meta
        config = runner.config or {}
        task_type = detect_task_type("research DSGVO compliance")
        assert task_type == "research"
        meta = get_skill_meta(task_type, config)
        model = resolve_model(meta.model_category, config)
        assert model == "opus"
        assert meta.permission_mode == "plan"

    def test_full_docsync():
        from brain.command import resolve_model
        from brain.router import detect_task_type, get_skill_meta
        config = runner.config or {}
        task_type = detect_task_type("sync docs for geofrey")
        assert task_type == "doc-sync"
        meta = get_skill_meta(task_type, config)
        model = resolve_model(meta.model_category, config)
        assert model == "sonnet"

    def test_command_all_types():
        from brain.command import CommandSpec, build_command, resolve_model
        from brain.router import get_skill_meta
        config = runner.config or {}
        plan_types = {"review", "research", "security"}
        for skill in ["code-fix", "feature", "refactor", "review", "research", "security", "doc-sync"]:
            meta = get_skill_meta(skill, config)
            model = resolve_model(meta.model_category, config)
            spec = CommandSpec(
                prompt=f"Test {skill}", project_path="/tmp",
                model=model, max_turns=meta.max_turns,
                max_budget_usd=meta.max_budget_usd,
                permission_mode=meta.permission_mode,
            )
            cmd = build_command(spec)
            assert "claude" in cmd
            assert "--cwd" in cmd
            if skill in plan_types:
                assert "--permission-mode" in cmd, f"{skill} should have --permission-mode"

    def test_queue_to_briefing():
        from brain.briefing import format_briefing, generate_briefing
        from brain.models import Task, TaskStatus
        tasks = [
            Task(id="q1", description="Fix auth", status=TaskStatus.DONE, result="Committed fix abc", project="meus"),
            Task(id="q2", description="Deploy", status=TaskStatus.FAILED, error="Network timeout", project="meus"),
            Task(id="q3", description="Config review", status=TaskStatus.NEEDS_INPUT, questions=["Which env?"], project="geofrey"),
        ]
        summary = {
            "done": 1, "failed": 1, "needs_input": 1, "pending": 0, "running": 0,
            "tasks_done": [tasks[0]], "tasks_failed": [tasks[1]],
            "tasks_needs_input": [tasks[2]], "tasks_pending": [], "tasks_running": [],
        }
        with patch("brain.briefing.get_overnight_summary", return_value=summary), \
             patch("brain.briefing.load_config", return_value={}):
            briefing = generate_briefing(config={})
        text = format_briefing(briefing)
        assert "Fix auth" in text
        assert "FAILED" in text
        assert "Which env?" in text

    runner.run_test("full_code_fix_pipeline", test_full_code_fix)
    runner.run_test("full_research_pipeline", test_full_research)
    runner.run_test("full_docsync_pipeline", test_full_docsync)
    runner.run_test("command_all_types", test_command_all_types)
    runner.run_test("queue_to_briefing", test_queue_to_briefing)


# ---------------------------------------------------------------------------
# Phase 7: Intelligence Pipeline
# ---------------------------------------------------------------------------

def run_phase_7(runner: TestRunner):
    runner.phase = 7
    print("\n--- Phase 7: Intelligence Pipeline ---")

    def test_parse_jsonl():
        from knowledge.intelligence import parse_session_jsonl
        tmp_file = Path(runner.temp_dir) / "test_session.jsonl"
        tmp_file.write_text(SAMPLE_SESSION_JSONL, encoding="utf-8")
        turns = parse_session_jsonl(tmp_file)
        assert len(turns) >= 2, f"Expected >= 2 turns, got {len(turns)}"
        roles = [t["role"] for t in turns]
        assert "user" in roles
        assert "assistant" in roles

    def test_chunk_conversation():
        from knowledge.intelligence import chunk_conversation
        turns = [
            {"role": "user", "text": "Fix the bug " * 20, "timestamp": 1},
            {"role": "assistant", "text": "Found the issue " * 30, "timestamp": 2},
            {"role": "user", "text": "Check tests " * 10, "timestamp": 3},
            {"role": "assistant", "text": "Tests pass " * 25, "timestamp": 4},
        ]
        chunks = chunk_conversation(turns, max_chars=500)
        assert len(chunks) >= 2, f"Expected >= 2 chunks, got {len(chunks)}"

    def test_parse_json_clean():
        from knowledge.intelligence import _parse_llm_json
        result = _parse_llm_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_parse_json_fence():
        from knowledge.intelligence import _parse_llm_json
        result = _parse_llm_json('Here is the JSON:\n```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_parse_json_surrounded():
        from knowledge.intelligence import _parse_llm_json
        result = _parse_llm_json('Some text before {"key": "value"} and after')
        assert result == {"key": "value"}

    def test_full_extract_pipeline():
        from knowledge.intelligence import (
            chunk_conversation,
            consolidate_learnings,
            extract_learnings_chunk,
            parse_session_jsonl,
        )
        config = runner.config

        tmp_file = Path(runner.temp_dir) / "pipeline_session.jsonl"
        tmp_file.write_text(SAMPLE_SESSION_JSONL, encoding="utf-8")
        turns = parse_session_jsonl(tmp_file)
        assert len(turns) >= 2

        chunks = chunk_conversation(turns, max_chars=2500)
        assert len(chunks) >= 1

        chunk_results = []
        for chunk in chunks:
            result = extract_learnings_chunk(chunk, "test-project", "2026-03-26", config)
            chunk_results.append(result)

        categories = ["decisions", "bugs", "discoveries", "negative_knowledge", "configuration", "patterns"]
        final = consolidate_learnings(chunk_results, "test-project", "2026-03-26", config)
        assert isinstance(final, dict)
        for cat in categories:
            assert cat in final, f"Missing category: {cat}"
        total = sum(len(v) for v in final.values() if isinstance(v, list))
        print(f"           Extracted {total} learnings from {len(chunks)} chunk(s)")
        print(f"           Result: {json.dumps(final, indent=2, ensure_ascii=False)[:300]}")

    def test_save_learnings_md():
        from knowledge.intelligence import save_learnings_md
        learnings = {
            "decisions": ["Use SQLite for queue"],
            "bugs": ["Token not refreshed"],
            "discoveries": [],
            "negative_knowledge": [],
            "configuration": ["think=False required"],
            "patterns": [],
        }
        test_config = dict(runner.config or {})
        test_config["paths"] = dict(test_config.get("paths", {}))
        test_config["paths"]["session_learnings"] = os.path.join(runner.temp_dir, "learnings")
        path = save_learnings_md(learnings, "test-project", "test-session-id", "2026-03-26", test_config)
        assert path.exists()
        content = path.read_text(encoding="utf-8")
        assert "---" in content  # YAML frontmatter
        assert "test-project" in content
        assert "Use SQLite" in content

    runner.run_test("parse_session_jsonl", test_parse_jsonl)
    runner.run_test("chunk_conversation", test_chunk_conversation)
    runner.run_test("parse_json_clean", test_parse_json_clean)
    runner.run_test("parse_json_fence", test_parse_json_fence)
    runner.run_test("parse_json_surrounded", test_parse_json_surrounded)
    runner.run_test("full_extract_pipeline", test_full_extract_pipeline, skip_if_no_ollama=True)
    runner.run_test("save_learnings_md", test_save_learnings_md)


# ---------------------------------------------------------------------------
# Phase 8: Claude Code CLI (command-build only)
# ---------------------------------------------------------------------------

def run_phase_8(runner: TestRunner):
    runner.phase = 8
    print("\n--- Phase 8: Claude Code CLI (command-build only) ---")

    def test_session_command():
        from brain.session import start_session
        with patch("brain.session.subprocess.run") as mock_run:
            mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
            session = start_session("/tmp/test", "Fix bug", model="opus", max_turns=30, max_budget_usd=5.0)
        call_args = mock_run.call_args[0][0]
        cmd_str = " ".join(call_args)
        assert "tmux" in cmd_str
        assert "claude" in cmd_str
        assert "--dangerously-skip-permissions" in cmd_str
        assert "opus" in cmd_str

    def test_sync_command():
        from brain.session import run_session_sync
        with patch("brain.session.subprocess.run") as mock_run:
            mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "Done", "stderr": ""})()
            result = run_session_sync("/tmp/test", "Fix bug", model="sonnet", max_turns=20, max_budget_usd=3.0)
        call_args = mock_run.call_args[0][0]
        cmd_str = " ".join(call_args)
        assert "claude" in cmd_str
        assert "sonnet" in cmd_str
        assert "20" in cmd_str
        assert "3.00" in cmd_str

    def test_image_prompt_parsing():
        from brain.linkedin import _parse_image_options
        text = "1. A futuristic office with AI screens\n2. A handshake between human and robot\n3. Data flowing through a secure tunnel\n4. A shield protecting cloud infrastructure"
        options = _parse_image_options(text)
        assert len(options) == 4, f"Expected 4 options, got {len(options)}"

    def test_image_prompt_command():
        from brain.linkedin import generate_image_prompts
        mock_stdout = "1. Futuristic office\n2. Robot handshake\n3. Data tunnel\n4. Shield cloud"
        with patch("brain.linkedin.subprocess.run") as mock_run:
            mock_run.return_value = type("R", (), {"returncode": 0, "stdout": mock_stdout, "stderr": ""})()
            options = generate_image_prompts("Test post about AI")
        assert len(options) == 4
        call_args = mock_run.call_args
        cmd_str = str(call_args)
        assert "claude" in cmd_str
        assert "sonnet" in cmd_str

    runner.run_test("session_command", test_session_command)
    runner.run_test("sync_session_command", test_sync_command)
    runner.run_test("image_prompt_parsing", test_image_prompt_parsing)
    runner.run_test("image_prompt_command", test_image_prompt_command)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("\n" + "=" * 60)
    print("  geofrey — Comprehensive Integration Tests")
    print("=" * 60)

    runner = TestRunner()

    try:
        run_phase_0(runner)
        run_phase_1(runner)
        run_phase_2(runner)
        run_phase_3(runner)
        run_phase_4(runner)
        run_phase_5(runner)
        run_phase_6(runner)
        run_phase_7(runner)
        run_phase_8(runner)
    except KeyboardInterrupt:
        print("\n\nInterrupted.")
    finally:
        all_passed = runner.print_summary()
        runner.cleanup()
        sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
