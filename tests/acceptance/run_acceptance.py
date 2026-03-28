#!/usr/bin/env python3
"""CLI entry point for geofrey acceptance tests.

Usage:
    python tests/acceptance/run_acceptance.py --all          # Run all 50
    python tests/acceptance/run_acceptance.py --failed        # Re-run failed
    python tests/acceptance/run_acceptance.py --category X    # Run one category
    python tests/acceptance/run_acceptance.py --id UC-015     # Run single
    python tests/acceptance/run_acceptance.py --fix-loop 5    # Iterative fix
    python tests/acceptance/run_acceptance.py --setup         # Setup only
"""

import argparse
import sys
from pathlib import Path

# Ensure project root on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


def main():
    parser = argparse.ArgumentParser(description="geofrey acceptance tests — 50 use cases")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="Run all 50 use cases")
    group.add_argument("--failed", action="store_true", help="Re-run previously failed")
    group.add_argument("--category", type=str, help="Run one category")
    group.add_argument("--id", type=str, help="Run single use case by ID")
    group.add_argument("--fix-loop", type=int, metavar="N", help="Iterative fix loop (max N iterations)")
    group.add_argument("--setup", action="store_true", help="Setup sandbox only")
    args = parser.parse_args()

    from tests.acceptance.harness import TestHarness
    harness = TestHarness()

    if args.setup:
        harness.setup()
        print("Sandbox ready.")
    elif args.all:
        harness.run_all()
    elif args.failed:
        harness.run_failed()
    elif args.category:
        harness.run_category(args.category)
    elif args.id:
        harness.run_one(args.id)
    elif args.fix_loop:
        harness.fix_loop(max_iterations=args.fix_loop)


if __name__ == "__main__":
    main()
