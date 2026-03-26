"""Quality gates — pre-execution validation for Claude Code commands.

Inspired by gstack's quality gate enforcement. With the Python-first
architecture, command structure (--cwd, --model, --budget) is guaranteed
by CommandBuilder. Gates now only validate prompt content for safety.
"""


# Dangerous patterns to detect in prompt text
_DANGEROUS_PATTERNS = [
    ("rm -rf", "recursive delete"),
    ("drop table", "database drop"),
    ("drop database", "database drop"),
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

    Command structure (--cwd, --model, --budget) is guaranteed by
    CommandBuilder and does not need validation here.

    Returns list of issues (empty = all gates passed).
    Issues prefixed with [WARN] are advisory.
    """
    issues = []
    text_lower = prompt_text.lower()

    for pattern, label in _DANGEROUS_PATTERNS:
        if pattern in text_lower:
            issues.append(f"[WARN] Dangerous pattern: {label} ({pattern})")

    for pattern, label in _SECRET_PATTERNS:
        if pattern in text_lower:
            issues.append(f"[WARN] {label} in prompt text ({pattern})")

    return issues


def validate_command(command: str) -> list[str]:
    """Validate a Claude Code command before execution.

    Deprecated: Use validate_prompt() instead. Command structure is now
    guaranteed by CommandBuilder. Kept for backward compatibility.
    """
    import re
    from pathlib import Path

    issues = []

    stripped = command.strip()
    if not stripped.startswith("claude"):
        issues.append("[BLOCK] Not a claude command")
        return issues

    cwd_match = re.search(r"--cwd\s+(\S+)", command)
    if not cwd_match:
        issues.append("[BLOCK] Missing --cwd (project scope)")
    else:
        cwd_path = Path(cwd_match.group(1)).expanduser()
        if not cwd_path.exists():
            issues.append(f"[BLOCK] --cwd path does not exist: {cwd_path}")

    if "--max-budget-usd" not in command:
        issues.append("[BLOCK] Missing --max-budget-usd (budget limit)")

    prompt_match = re.search(r'-p\s+"(.*?)"', command, re.DOTALL)
    if not prompt_match:
        prompt_match = re.search(r"-p\s+'(.*?)'", command, re.DOTALL)
    if prompt_match:
        issues.extend(validate_prompt(prompt_match.group(1)))

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
