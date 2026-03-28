"""Report writer — generates markdown reports for acceptance test results."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass
class UseCaseResult:
    """Result of a single use case execution."""
    id: str
    category: str
    title: str
    status: str  # PASS | FAIL | ERROR
    assertions: list[tuple[bool, str]]  # (passed, description)
    duration_ms: float
    input_text: str = ""
    expected: str = ""
    actual: str = ""
    error: str = ""
    observations: str = ""


def write_use_case_report(result: UseCaseResult, reports_dir: Path) -> None:
    """Write a markdown report for a single use case."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    import re
    safe_title = re.sub(r"[^a-z0-9]+", "_", result.title.lower())[:40].strip("_")
    slug = result.id.replace("-", "_").lower() + "_" + safe_title
    path = reports_dir / f"{slug}.md"

    lines = [
        f"# {result.id}: {result.title}",
        "",
        f"**Category:** {result.category}",
        f"**Status:** {result.status}",
        f"**Duration:** {result.duration_ms:.1f}ms",
        "",
    ]

    if result.input_text:
        lines.extend(["## Input", f"`{result.input_text}`", ""])

    lines.extend(["## Assertions", "| # | Result | Detail |", "|---|--------|--------|"])
    for i, (passed, desc) in enumerate(result.assertions, 1):
        mark = "PASS" if passed else "**FAIL**"
        lines.append(f"| {i} | {mark} | {desc} |")
    lines.append("")

    if result.error:
        lines.extend(["## Error", f"```\n{result.error}\n```", ""])

    if result.observations:
        lines.extend(["## Observations", result.observations, ""])

    path.write_text("\n".join(lines), encoding="utf-8")


def write_summary(results: list[UseCaseResult], reports_dir: Path, iteration: int = 1) -> None:
    """Write the summary markdown report."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / "summary.md"

    passed = sum(1 for r in results if r.status == "PASS")
    failed = sum(1 for r in results if r.status == "FAIL")
    errors = sum(1 for r in results if r.status == "ERROR")
    total = len(results)

    # Group by category
    categories: dict[str, list[UseCaseResult]] = {}
    for r in results:
        categories.setdefault(r.category, []).append(r)

    lines = [
        "# geofrey Acceptance Test Summary",
        "",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Iteration:** {iteration}",
        "",
        f"## Results: {passed}/{total} PASS, {failed} FAIL, {errors} ERROR",
        "",
    ]

    # Category breakdown
    lines.extend(["## By Category", "", "| Category | Total | Pass | Fail |", "|----------|-------|------|------|"])
    for cat, cat_results in sorted(categories.items()):
        cat_pass = sum(1 for r in cat_results if r.status == "PASS")
        cat_fail = sum(1 for r in cat_results if r.status != "PASS")
        lines.append(f"| {cat} | {len(cat_results)} | {cat_pass} | {cat_fail} |")
    lines.append("")

    # All use cases table
    lines.extend(["## All Use Cases", "", "| ID | Category | Title | Status | Duration |", "|----|----------|-------|--------|----------|"])
    for r in results:
        lines.append(f"| {r.id} | {r.category} | {r.title} | {r.status} | {r.duration_ms:.0f}ms |")
    lines.append("")

    # Failed tests detail
    failures = [r for r in results if r.status != "PASS"]
    if failures:
        lines.extend(["## Failed Tests", ""])
        for r in failures:
            lines.append(f"### {r.id}: {r.title}")
            failed_assertions = [desc for ok, desc in r.assertions if not ok]
            for desc in failed_assertions:
                lines.append(f"- {desc}")
            if r.error:
                lines.append(f"- Error: `{r.error[:200]}`")
            lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
