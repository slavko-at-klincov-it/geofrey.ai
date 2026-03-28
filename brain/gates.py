"""Quality gates — pre-execution validation for prompts.

With the Python-first architecture, command structure (--cwd, --model,
--budget) is guaranteed by CommandBuilder. Gates validate prompt content:
- [BLOCK] issues prevent execution entirely (critical safety)
- [WARN] issues are advisory (user decides)
"""

import re


# Patterns that BLOCK execution — these are too dangerous for autonomous runs
# Uses regex so "rm -rf /" only blocks root deletion, not "rm -rf /tmp/..."
_BLOCK_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"rm\s+-rf\s+/(?:\s|$|;|\|)"), "recursive delete from root"),
    (re.compile(r"rm\s+-rf\s+~(?:\s|$|;|\|)"), "recursive delete from home"),
    (re.compile(r"drop\s+database"), "database destruction"),
    (re.compile(r"force\s+push\s+to\s+main"), "force push to main branch"),
    (re.compile(r"force\s+push\s+to\s+master"), "force push to master branch"),
    (re.compile(r"--force\s+origin\s+main"), "force push to main"),
    (re.compile(r"--force\s+origin\s+master"), "force push to master"),
]

# Patterns that WARN — dangerous but context-dependent (simple substring match)
_WARN_PATTERNS = [
    ("rm -rf", "recursive delete"),
    ("drop table", "database drop"),
    ("force push", "force push"),
    ("--force", "force flag"),
    ("git reset --hard", "destructive git reset"),
    ("git clean -f", "destructive git clean"),
]

# Patterns that suggest secrets in prompts
_SECRET_PATTERNS = [
    ("password", "possible secret"),
    ("api_key", "possible secret"),
    ("api-key", "possible secret"),
    ("secret_key", "possible secret"),
    ("access_token", "possible secret"),
]


def validate_prompt(prompt_text: str) -> list[str]:
    """Validate prompt text for secrets and dangerous patterns.

    Returns list of issues (empty = all gates passed).
    Issues prefixed with [BLOCK] prevent execution.
    Issues prefixed with [WARN] are advisory.
    """
    issues = []
    text_lower = prompt_text.lower()

    for pattern, label in _BLOCK_PATTERNS:
        if pattern.search(text_lower):
            issues.append(f"[BLOCK] Critical: {label}")

    for pattern, label in _WARN_PATTERNS:
        if pattern in text_lower:
            issues.append(f"[WARN] Dangerous pattern: {label} ({pattern})")

    for pattern, label in _SECRET_PATTERNS:
        if pattern in text_lower:
            issues.append(f"[WARN] {label} in prompt text ({pattern})")

    return issues


def format_gate_results(issues: list[str]) -> str:
    """Format gate validation results for display."""
    if not issues:
        return ""
    lines = ["  Quality gate issues:"]
    for issue in issues:
        lines.append(f"    {issue}")
    return "\n".join(lines)


def has_blockers(issues: list[str]) -> bool:
    """Check if any issues are blocking (critical)."""
    return any(issue.startswith("[BLOCK]") for issue in issues)
