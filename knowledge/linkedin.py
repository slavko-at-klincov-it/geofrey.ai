"""LinkedIn post style ingestion and querying."""

import os
import re
from pathlib import Path

import ollama
from rich.console import Console

from knowledge.store import VectorStore, load_config

console = Console()
COLLECTION_NAME = "linkedin_style"


def parse_posts(md_path: str) -> list[dict]:
    """Parse all_posts.md into individual posts with metadata."""
    path = Path(os.path.expanduser(md_path))
    if not path.exists():
        console.print(f"[red]File not found: {path}[/red]")
        return []

    text = path.read_text(encoding="utf-8")
    post_pattern = re.compile(r"^## Post (\d+) - (\d{4}-\d{2}-\d{2})", re.MULTILINE)
    matches = list(post_pattern.finditer(text))

    posts = []
    for i, match in enumerate(matches):
        post_num = int(match.group(1))
        post_date = match.group(2)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end].strip()

        thema = ""
        post_text = block
        quellen = []

        thema_match = re.search(r"^Thema:\s*(.+)$", block, re.MULTILINE)
        if thema_match:
            thema = thema_match.group(1).strip()

        text_match = re.search(r"^Text:\s*\n(.*?)(?=^Quellen:|\Z)", block, re.MULTILINE | re.DOTALL)
        if text_match:
            post_text = text_match.group(1).strip()

        quellen_match = re.search(r"^Quellen:\s*\[(.+?)\]", block, re.MULTILINE)
        if quellen_match:
            quellen = [q.strip().strip('"') for q in quellen_match.group(1).split(",") if q.strip()]

        posts.append({
            "number": post_num, "date": post_date, "thema": thema,
            "text": post_text, "quellen": quellen, "word_count": len(post_text.split()),
        })
    return posts


def ingest_linkedin_posts(config: dict | None = None):
    """Parse and ingest LinkedIn posts into linkedin_style collection."""
    config = config or load_config()
    posts_path = config.get("paths", {}).get("linkedin_posts", "data/linkedin/all_posts.md")
    # Resolve relative to project root
    if not os.path.isabs(posts_path):
        posts_path = str(Path(__file__).parent.parent / posts_path)

    posts = parse_posts(posts_path)
    if not posts:
        console.print("[yellow]No posts found.[/yellow]")
        return 0

    store = VectorStore(config, collection_name=COLLECTION_NAME)
    embed_model = config["embedding"]["model"]
    total = 0

    for post in posts:
        chunk_id = f"linkedin_post_{post['number']}"
        try:
            response = ollama.embed(model=embed_model, input=post["text"])
            embedding = response["embeddings"][0]
        except Exception as e:
            console.print(f"[red]Embedding error for Post {post['number']}: {e}[/red]")
            continue
        store.upsert(
            ids=[chunk_id], documents=[post["text"]], embeddings=[embedding],
            metadatas=[{"post_number": post["number"], "post_date": post["date"],
                        "thema": post["thema"], "word_count": post["word_count"],
                        "quellen": ",".join(post["quellen"]) if post["quellen"] else ""}],
        )
        total += 1

    console.print(f"[green]Ingested {total} LinkedIn posts into {COLLECTION_NAME}.[/green]")
    return total


def get_style_guide(config: dict | None = None) -> str:
    """Analyze all posts and return a style summary."""
    config = config or load_config()
    store = VectorStore(config, collection_name=COLLECTION_NAME)
    result = store.collection.get(include=["documents", "metadatas"])
    if not result["documents"]:
        return "Keine LinkedIn-Posts in der Knowledge Base."

    word_counts, themen = [], set()
    for doc, meta in zip(result["documents"], result["metadatas"]):
        word_counts.append(meta.get("word_count", len(doc.split())))
        thema = meta.get("thema", "")
        if (thema and len(thema) < 60
            and not any(c in thema for c in "!?🚀☀️🙌😤😴💡🗂️🔧🏙️")
            and not thema.startswith(("\"", "'", "\u201e", "Part "))
            and "..." not in thema and thema[0].isalpha()):
            themen.add(thema)

    avg_w = sum(word_counts) / len(word_counts) if word_counts else 0
    themen_str = ", ".join(sorted(themen)) if themen else "(keine Themen-Tags)"

    return f"""=== LINKEDIN POST STYLE GUIDE ===
Basierend auf {len(result['documents'])} analysierten Posts.

Sprache: Deutsch
Ton: Direkt, praxisnah, persoenlich (Du-Form)
Struktur: Hook-Frage/Aussage -> Problem/Beobachtung -> Loesung/Einsicht -> Call-to-Action Frage
Laenge: Oe {avg_w:.0f} Woerter (min: {min(word_counts)}, max: {max(word_counts)})
Typische Themen: {themen_str}

Stilregeln:
- Kurze Saetze, viele Absaetze
- Persoenliche Anekdoten und Beobachtungen einbauen
- Am Ende immer eine Frage an die Community
- DACH-Kontext (DSGVO, oesterreichische/deutsche Beispiele)
- Keine uebertriebenen Emojis, maximal sparsam einsetzen
- Praxisnah: konkrete Tipps statt Theorie"""
