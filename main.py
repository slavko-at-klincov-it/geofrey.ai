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

    # LinkedIn generation
    li_parser = subparsers.add_parser("post", help="Generate a LinkedIn post")
    li_parser.add_argument("topic", nargs="?", help="Post topic (optional, will ask if missing)")

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

    # Session Intelligence
    learn_parser = subparsers.add_parser("learn", help="Extract learnings from Claude Code sessions")
    learn_parser.add_argument("--project", help="Project name filter")
    learn_parser.add_argument("--session", help="Specific session ID (prefix)")
    learn_parser.add_argument("--max", type=int, default=10, help="Max sessions to process")
    learn_parser.add_argument("--reprocess", action="store_true", help="Re-extract existing")

    learnings_parser = subparsers.add_parser("learnings", help="View/search session learnings")
    learnings_parser.add_argument("project", nargs="?", help="Project name")
    learnings_parser.add_argument("--query", help="Search learnings via RAG")

    # Scripts
    subparsers.add_parser("embed", help="Embed Claude Code knowledge base (--reset, --changed)")

    args, remaining = parser.parse_known_args()
    config = load_config()

    if args.command == "post":
        from brain.linkedin import linkedin_flow
        linkedin_flow(args.topic)

    elif args.command == "chat":
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

    elif args.command == "learn":
        from knowledge.intelligence import extract_all, extract_session
        if args.session:
            # Find specific session file
            from knowledge.sessions import CLAUDE_PROJECTS_DIR
            from knowledge.intelligence import _slug_to_project_name
            found = False
            if not CLAUDE_PROJECTS_DIR.exists():
                print("No Claude Code projects found.")
                sys.exit(1)
            for d in CLAUDE_PROJECTS_DIR.iterdir():
                if not d.is_dir():
                    continue
                for jsonl in d.glob("*.jsonl"):
                    if jsonl.stem.startswith(args.session):
                        project_name = _slug_to_project_name(d.name)
                        extract_session(jsonl, project_name, config)
                        found = True
                        break
                if found:
                    break
            if not found:
                print(f"Session '{args.session}' not found.")
        else:
            extract_all(project=args.project, config=config, max_sessions=args.max, reprocess=args.reprocess)

    elif args.command == "learnings":
        from knowledge.intelligence import view_learnings, query_learnings
        if args.query:
            results = query_learnings(args.query, project=args.project, config=config)
            if not results:
                print("No results found.")
            else:
                for i, r in enumerate(results, 1):
                    score = 1 - r["distance"]
                    print(f"\n{'='*60}")
                    print(f"[{i}] {r.get('project', '?')} / {r.get('category', '?')} (score: {score:.3f})")
                    print(f"{'='*60}")
                    print(r["text"][:500])
        else:
            print(view_learnings(project=args.project, config=config))

    elif args.command == "embed":
        import subprocess
        cmd = [sys.executable, "scripts/embed.py"] + remaining
        subprocess.run(cmd)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
