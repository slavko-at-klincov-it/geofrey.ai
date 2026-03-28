"""Test harness — orchestrates sandbox setup, use case execution, and reporting."""

import json
import sys
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tests.acceptance.report_writer import UseCaseResult, write_summary, write_use_case_report
from tests.acceptance.sandbox_setup import SandboxContext, create_sandbox
from tests.acceptance.use_cases import run_all, run_by_ids

SANDBOX_ROOT = PROJECT_ROOT / "tests" / "sandbox"
REPORTS_DIR = PROJECT_ROOT / "tests" / "acceptance" / "reports"
FAILED_JSON = REPORTS_DIR / "failed.json"


class TestHarness:
    """Orchestrates the full acceptance test cycle."""

    def __init__(self):
        self.ctx: SandboxContext | None = None
        self.results: list[UseCaseResult] = []

    def setup(self) -> None:
        """Create the sandbox with 3 fictional projects."""
        print("Setting up sandbox...")
        self.ctx = create_sandbox(SANDBOX_ROOT)
        print(f"  Sandbox created at {SANDBOX_ROOT}")
        print(f"  Projects: webshop, api-gateway, data-pipeline")
        print(f"  Decisions: {self.ctx.decisions_path}")

    def run_all(self) -> list[UseCaseResult]:
        """Run all 50 use cases."""
        if not self.ctx:
            self.setup()
        print(f"\nRunning 50 use cases...")
        self.results = run_all(self.ctx)
        self._report(self.results)
        return self.results

    def run_failed(self) -> list[UseCaseResult]:
        """Re-run only previously failed use cases."""
        if not self.ctx:
            self.setup()
        if not FAILED_JSON.exists():
            print("No failed.json found. Run --all first.")
            return []
        failed_ids = set(json.loads(FAILED_JSON.read_text()))
        if not failed_ids:
            print("No failed tests to re-run.")
            return []
        print(f"\nRe-running {len(failed_ids)} failed use cases: {', '.join(sorted(failed_ids))}")
        results = run_by_ids(self.ctx, failed_ids)
        self._report(results, merge_previous=True)
        return results

    def run_category(self, category: str) -> list[UseCaseResult]:
        """Run use cases for a specific category."""
        if not self.ctx:
            self.setup()
        from tests.acceptance.use_cases import ALL_USE_CASES
        ids = {uc_id for uc_id, cat, *_ in ALL_USE_CASES if cat == category}
        if not ids:
            print(f"Unknown category: {category}")
            return []
        print(f"\nRunning {len(ids)} use cases for category '{category}'...")
        results = run_by_ids(self.ctx, ids)
        self._report(results)
        return results

    def run_one(self, uc_id: str) -> list[UseCaseResult]:
        """Run a single use case."""
        if not self.ctx:
            self.setup()
        results = run_by_ids(self.ctx, {uc_id})
        if not results:
            print(f"Unknown use case: {uc_id}")
            return []
        self._report(results)
        return results

    def fix_loop(self, max_iterations: int = 5) -> list[UseCaseResult]:
        """Run all, then re-run failed iteratively until all pass or stuck."""
        results = self.run_all()
        for iteration in range(2, max_iterations + 1):
            failed = [r for r in results if r.status != "PASS"]
            if not failed:
                print(f"\n  ALL 50 PASS after {iteration - 1} iteration(s).")
                return results
            failed_ids = {r.id for r in failed}
            # Check if stuck (same failures as previous)
            prev_failed = set(json.loads(FAILED_JSON.read_text())) if FAILED_JSON.exists() else set()
            if failed_ids == prev_failed:
                print(f"\n  STUCK: Same {len(failed_ids)} tests failing. Manual investigation needed:")
                for r in failed:
                    print(f"    {r.id}: {r.title}")
                    if r.error:
                        print(f"      Error: {r.error[:100]}")
                return results
            # Save failed and re-run
            FAILED_JSON.write_text(json.dumps(sorted(failed_ids)))
            print(f"\n--- Iteration {iteration} ---")
            new_results = run_by_ids(self.ctx, failed_ids)
            # Merge into full results
            new_by_id = {r.id: r for r in new_results}
            results = [new_by_id.get(r.id, r) for r in results]
            self._report(results, iteration=iteration)
        return results

    def _report(self, results: list[UseCaseResult], iteration: int = 1, merge_previous: bool = False) -> None:
        """Generate reports and print summary."""
        if merge_previous and FAILED_JSON.exists():
            # Load all previous results concept — for now just report what we have
            pass

        passed = sum(1 for r in results if r.status == "PASS")
        failed = sum(1 for r in results if r.status == "FAIL")
        errors = sum(1 for r in results if r.status == "ERROR")
        total = len(results)

        # Write per-UC reports
        for r in results:
            write_use_case_report(r, REPORTS_DIR)

        # Write summary
        write_summary(results, REPORTS_DIR, iteration=iteration)

        # Save failed IDs
        failed_ids = sorted(r.id for r in results if r.status != "PASS")
        FAILED_JSON.write_text(json.dumps(failed_ids))

        # Print
        print(f"\n  Results: {passed}/{total} PASS, {failed} FAIL, {errors} ERROR")
        if failed_ids:
            print(f"  Failed: {', '.join(failed_ids)}")
        print(f"  Reports: {REPORTS_DIR}/summary.md")
