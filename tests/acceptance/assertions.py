"""Assertion helpers for acceptance tests."""


def assert_equals(label: str, expected, actual) -> tuple[bool, str]:
    """Check exact equality."""
    ok = expected == actual
    msg = f"{label}: expected={expected}, actual={actual}"
    return ok, msg


def assert_contains(label: str, text: str, substring: str) -> tuple[bool, str]:
    """Check that text contains substring."""
    ok = substring in text
    msg = f"{label}: {'found' if ok else 'NOT found'} '{substring}'"
    return ok, msg


def assert_not_contains(label: str, text: str, substring: str) -> tuple[bool, str]:
    """Check that text does NOT contain substring."""
    ok = substring not in text
    msg = f"{label}: {'correctly absent' if ok else 'UNEXPECTEDLY found'} '{substring}'"
    return ok, msg


def assert_prompt_sections(prompt: str, required: list[str], forbidden: list[str]) -> tuple[bool, list[str]]:
    """Check prompt has required sections and lacks forbidden ones."""
    diffs = []
    all_ok = True
    for section in required:
        if section not in prompt:
            diffs.append(f"MISSING required section: '{section}'")
            all_ok = False
    for section in forbidden:
        if section in prompt:
            diffs.append(f"UNEXPECTED section found: '{section}'")
            all_ok = False
    return all_ok, diffs


def assert_gate_result(issues: list[str], expected_blocks: int, expected_warns: int) -> tuple[bool, list[str]]:
    """Check gate validation results."""
    actual_blocks = sum(1 for i in issues if i.startswith("[BLOCK]"))
    actual_warns = sum(1 for i in issues if i.startswith("[WARN]"))
    diffs = []
    if actual_blocks != expected_blocks:
        diffs.append(f"Blocks: expected={expected_blocks}, actual={actual_blocks}")
    if actual_warns != expected_warns:
        diffs.append(f"Warns: expected={expected_warns}, actual={actual_warns}")
    return len(diffs) == 0, diffs


def assert_decision_ids(conflicts: list[str], expected_ids: list[str]) -> tuple[bool, list[str]]:
    """Check that expected decision IDs appear in conflict text."""
    conflict_text = "\n".join(conflicts)
    diffs = []
    for dec_id in expected_ids:
        if dec_id not in conflict_text:
            diffs.append(f"Decision {dec_id} NOT found in conflicts")
    return len(diffs) == 0, diffs


def assert_no_decision_ids(conflicts: list[str], forbidden_ids: list[str]) -> tuple[bool, list[str]]:
    """Check that forbidden decision IDs do NOT appear in conflicts."""
    conflict_text = "\n".join(conflicts)
    diffs = []
    for dec_id in forbidden_ids:
        if dec_id in conflict_text:
            diffs.append(f"Decision {dec_id} UNEXPECTEDLY found in conflicts")
    return len(diffs) == 0, diffs
