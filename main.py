#!/usr/bin/env python3
"""geofrey — Personal AI Assistant."""

import argparse
import sys

from knowledge.store import load_config


def main():
    parser = argparse.ArgumentParser(description="geofrey — Personal AI Assistant")
    subparsers = parser.add_subparsers(dest="command")

    # Brain commands
    subparsers.add_parser("chat", help="Interactive chat with geofrey (orchestrator mode)")
    task_parser = subparsers.add_parser("task", help="Single task for geofrey")
    task_parser.add_argument("task_text", help="Task description")

    # Knowledge commands
    ingest_parser = subparsers.add_parser("ingest", help="Index documents")
    ingest_parser.add_argument("path", help="Path to documents")
    ingest_parser.add_argument("--collection", default="knowledge")

    subparsers.add_parser("status", help="Show all collections")
    subparsers.add_parser("context-setup", help="Ingest DACH context files")
    subparsers.add_parser("linkedin-ingest", help="Import LinkedIn posts")
    subparsers.add_parser("linkedin-style", help="Show LinkedIn style guide")
    subparsers.add_parser("sessions-ingest", help="Import Claude Code sessions")
    subparsers.add_parser("inbox", help="Process inbox directory")

    hub_parser = subparsers.add_parser("hub-query", help="Query specific collections")
    hub_parser.add_argument("query_text", help="Search query")
    hub_parser.add_argument("--collections", default="knowledge")
    hub_parser.add_argument("--top", type=int, default=5)

    # Scripts
    subparsers.add_parser("embed", help="Embed Claude Code knowledge base (--reset, --changed)")

    args, remaining = parser.parse_known_args()
    config = load_config()

    if args.command == "chat":
        from brain.orchestrator import interactive
        interactive()

    elif args.command == "task":
        from brain.orchestrator import single_task
        single_task(args.task_text)

    elif args.command == "ingest":
        from knowledge.ingest import ingest
        ingest(args.path, config, collection_name=args.collection)

    elif args.command == "status":
        from knowledge.store import VectorStore
        store = VectorStore(config)
        status = store.status()
        print(f"DB path: {status['db_path']}")
        print(f"Total chunks: {status['total_chunks']}\n")
        for name, count in sorted(status["collections"].items()):
            print(f"  {name}: {count} chunks")

    elif args.command == "context-setup":
        from knowledge.context import ContextManager
        ContextManager(config).ingest_context_files()

    elif args.command == "linkedin-ingest":
        from knowledge.linkedin import ingest_linkedin_posts
        ingest_linkedin_posts(config)

    elif args.command == "linkedin-style":
        from knowledge.linkedin import get_style_guide
        print(get_style_guide(config))

    elif args.command == "sessions-ingest":
        from knowledge.sessions import ingest_sessions
        ingest_sessions(config)

    elif args.command == "inbox":
        from knowledge.sessions import process_inbox
        process_inbox(config)

    elif args.command == "hub-query":
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        cols = [c.strip() for c in args.collections.split(",")]
        results = hub.query(args.query_text, collections=cols, top_k=args.top)
        if not results:
            print("No results found.")
        else:
            for i, r in enumerate(results, 1):
                score = 1 - r["distance"]
                print(f"\n{'='*60}")
                print(f"[{i}] {r['source']} ({r['collection']}, score: {score:.3f})")
                print(f"{'='*60}")
                print(r["text"][:500])

    elif args.command == "embed":
        import subprocess
        cmd = [sys.executable, "scripts/embed.py"] + remaining
        subprocess.run(cmd)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
