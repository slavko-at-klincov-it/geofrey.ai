"""Marktforschung-Helferlein -- findet Probleme auf Reddit die nach einer App schreien.

Durchsucht deutschsprachige Subreddits nach wiederkehrenden Problemen,
Beschwerden und Wuenschen. Wenn ein Problem gross genug ist (viele
Upvotes, mehrere Posts, Leute fragen nach Loesungen), wird ein Proposal
mit App-Idee erstellt.

Nutzt Reddit's oeffentliche JSON API (kein Account noetig).
"""

import json
import logging
import re
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

from brain.helferlein import register
from brain.proposals import create_proposal, has_pending_proposal
from brain.queue import DEFAULT_DB_PATH

logger = logging.getLogger("geofrey.helferlein.marktforschung")

USER_AGENT = "geofrey-marktforschung/1.0 (local research bot, no spam)"

# Subreddits: German business/tools + international AI/tech
SUBREDDITS_DE = [
    "de_EDV",
    "selbststaendig",
    "FragReddit",
    "finanzen",
    "arbeitsleben",
    "Handwerk",
    "steuern",
]

SUBREDDITS_INTERNATIONAL = [
    "LocalLLaMA",
    "MachineLearning",
    "iOSProgramming",
    "selfhosted",
    "SideProject",
    "startups",
    "SmallBusiness",
    "Entrepreneur",
]

SUBREDDITS = SUBREDDITS_DE + SUBREDDITS_INTERNATIONAL

# Search queries: German + English
PROBLEM_QUERIES_DE = [
    "gibt es eine App",
    "gibt es ein Tool",
    "kennt jemand ein Tool",
    "welche Software nutzt ihr",
    "wie automatisiert ihr",
    "Alternative zu",
    "Loesung gesucht",
    "gibt es sowas fuer",
]

PROBLEM_QUERIES_EN = [
    "is there a tool",
    "any app for",
    "alternative to",
    "on-device training",
    "local LLM",
    "iPhone ML",
    "Apple Neural Engine",
    "self-hosted",
]

PROBLEM_QUERIES = PROBLEM_QUERIES_DE + PROBLEM_QUERIES_EN

# Minimum thresholds for "big enough" problems
MIN_UPVOTES = 15
MIN_COMMENTS = 10
MAX_AGE_DAYS = 30


def _reddit_get(url: str) -> dict | None:
    """GET request to Reddit JSON API with rate limiting."""
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        time.sleep(2)  # Rate limit: max 1 request per 2 seconds
        return data
    except (URLError, json.JSONDecodeError, OSError) as e:
        logger.warning(f"Reddit API failed for {url}: {e}")
        return None


def _search_subreddit(subreddit: str, query: str, limit: int = 10) -> list[dict]:
    """Search a subreddit for posts matching a query.

    Returns list of {title, url, score, num_comments, selftext, created_utc, subreddit}.
    """
    encoded_query = query.replace(" ", "%20")
    url = (
        f"https://www.reddit.com/r/{subreddit}/search.json"
        f"?q={encoded_query}&restrict_sr=on&sort=relevance&t=month&limit={limit}"
    )

    data = _reddit_get(url)
    if not data or "data" not in data:
        return []

    results = []
    for child in data["data"].get("children", []):
        post = child.get("data", {})
        if not post:
            continue

        created = datetime.fromtimestamp(post.get("created_utc", 0))
        age = datetime.now() - created
        if age.days > MAX_AGE_DAYS:
            continue

        results.append({
            "title": post.get("title", ""),
            "url": f"https://www.reddit.com{post.get('permalink', '')}",
            "score": post.get("score", 0),
            "num_comments": post.get("num_comments", 0),
            "selftext": (post.get("selftext", "") or "")[:1000],
            "created_utc": post.get("created_utc", 0),
            "subreddit": post.get("subreddit", subreddit),
            "author": post.get("author", ""),
        })

    return results


def _init_findings_table(db_path: str | None = None) -> None:
    """Create table for tracking seen Reddit posts."""
    db_path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reddit_findings (
            url TEXT PRIMARY KEY,
            title TEXT,
            subreddit TEXT,
            score INTEGER,
            num_comments INTEGER,
            query TEXT,
            found_at TEXT,
            included_in_proposal TEXT
        )
    """)
    conn.commit()
    conn.close()


def _is_seen(url: str, db_path: str | None = None) -> bool:
    """Check if we already processed this Reddit post."""
    db_path = db_path or DEFAULT_DB_PATH
    _init_findings_table(db_path)
    conn = sqlite3.connect(db_path, timeout=5.0)
    row = conn.execute("SELECT url FROM reddit_findings WHERE url = ?", (url,)).fetchone()
    conn.close()
    return row is not None


def _save_finding(post: dict, query: str, db_path: str | None = None) -> None:
    """Save a Reddit finding to the database."""
    db_path = db_path or DEFAULT_DB_PATH
    _init_findings_table(db_path)
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.execute(
        """INSERT OR IGNORE INTO reddit_findings
           (url, title, subreddit, score, num_comments, query, found_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            post["url"], post["title"], post["subreddit"],
            post["score"], post["num_comments"], query,
            datetime.now().isoformat(),
        ),
    )
    conn.commit()
    conn.close()


# Keywords that indicate the post is about a software/tool need
RELEVANCE_KEYWORDS = [
    # German
    "app", "tool", "software", "programm", "automatisier", "excel",
    "buchhaltung", "rechnung", "crm", "erp", "dashboard", "workflow",
    "browser", "extension", "plugin", "api", "script", "bot",
    "alternativ", "empfehl", "losung", "loessung", "selbststaendig",
    "freiberuf", "unternehm", "verwalt", "organis", "planung",
    "termin", "kalender", "projekt", "aufgabe", "task", "todo",
    "dsgvo", "datenschutz", "barrierefrei", "digital", "cloud",
    "backup", "sicher", "passwort", "verschluessel",
    # English AI/ML/Tech
    "llm", "model", "training", "fine-tun", "inference", "neural",
    "transformer", "gpu", "vram", "gguf", "quantiz", "mlx",
    "ollama", "llama", "whisper", "tts", "stt", "speech",
    "on-device", "local ai", "self-host", "open source",
    "iphone", "ios", "macos", "apple silicon", "coreml", "ane",
    "monitor", "benchmark", "voice clon", "transcri",
    "rag", "vector", "embedding", "knowledge base",
    "automat", "agent", "orchestrat", "pipeline",
]


# Posts with these title patterns are almost never actionable app ideas
NOISE_PATTERNS = [
    "rant", "tirade", "chef", "kuendig", "kündig", "gehalt",
    "bewerbung schreib", "vorstellungsgespr", "whatsapp gruppe",
    "privatinsolvenz", "scam", "betrug", "krieg", "politik",
    "mein arbeitgeber", "mein chef", "erfahrungsbericht",
]


def _is_relevant(post: dict) -> bool:
    """Check if post is about a software/tool need (not rants or career advice)."""
    title_lower = post["title"].lower()
    text = (title_lower + " " + post.get("selftext", "")[:500].lower())

    # Filter out noise
    if any(noise in title_lower for noise in NOISE_PATTERNS):
        return False

    # Must contain at least one tool/software keyword
    return any(kw in text for kw in RELEVANCE_KEYWORDS)


def _is_significant(post: dict) -> bool:
    """Check if a post represents a significant enough problem."""
    if not _is_relevant(post):
        return False
    return post["score"] >= MIN_UPVOTES or post["num_comments"] >= MIN_COMMENTS


def _cluster_by_topic(posts: list[dict]) -> dict[str, list[dict]]:
    """Group posts by similar topics using simple keyword overlap.

    Returns dict of topic_key -> list of posts.
    """
    clusters: dict[str, list[dict]] = {}

    for post in posts:
        title_words = set(re.findall(r'\w{4,}', post["title"].lower()))

        # Try to find an existing cluster with overlapping keywords
        matched = False
        for key, cluster_posts in clusters.items():
            key_words = set(re.findall(r'\w{4,}', key.lower()))
            overlap = title_words & key_words
            if len(overlap) >= 2:
                cluster_posts.append(post)
                matched = True
                break

        if not matched:
            clusters[post["title"]] = [post]

    return clusters


def _build_analysis_prompt(cluster_key: str, posts: list[dict]) -> str:
    """Build a Claude Code prompt to analyze a problem cluster and suggest app ideas."""
    posts_text = ""
    for i, p in enumerate(posts[:5], 1):
        posts_text += (
            f"\n{i}. [{p['subreddit']}] {p['title']} "
            f"(Score: {p['score']}, Kommentare: {p['num_comments']})\n"
            f"   {p['selftext'][:300]}\n"
            f"   URL: {p['url']}\n"
        )

    return (
        f"Analysiere folgende Reddit-Posts aus deutschsprachigen Subreddits.\n"
        f"Sie deuten auf ein wiederkehrendes Problem oder Beduerfnis hin.\n\n"
        f"Posts:{posts_text}\n\n"
        f"Aufgabe:\n"
        f"1. Was ist das Kernproblem das diese Leute haben?\n"
        f"2. Gibt es bereits gute Loesungen dafuer? (kurze Recherche)\n"
        f"3. Wenn nicht: Beschreibe eine App/Tool-Idee die das loesen koennte\n"
        f"   - Name (kreativ, einpraegsam)\n"
        f"   - Was es tut (2-3 Saetze)\n"
        f"   - Tech Stack Empfehlung\n"
        f"   - Zielgruppe\n"
        f"   - Monetarisierung (Freemium, SaaS, einmalig)\n"
        f"   - Geschaetzter Aufwand (Tage/Wochen)\n"
        f"4. Wie gross ist der Markt im DACH-Raum?\n\n"
        f"Sprache: Deutsch. Kein Emoji. Sei ehrlich, nicht jedes Problem braucht eine App."
    )


@register
class MarktforschungHelferlein:
    """Searches Reddit for problems that could become app ideas."""

    name = "marktforschung"

    def run(self, config: dict) -> int:
        """Search Reddit for problems. Returns number of proposals created.

        Two-phase approach:
        1. Gather findings → update Knowledge Base (always, free)
        2. Match against own projects → create Proposals (only when match found)
        """
        from brain.helferlein.intelligence import (
            match_projects,
            update_knowledge_base,
            create_opportunity_proposal,
        )

        all_posts: list[dict] = []

        # Search across subreddits and queries (limited to avoid rate limits)
        # Overnight: more coverage. Each API call = 2sec wait.
        # 5 subreddits x 4 queries = 20 calls = ~40 seconds
        subreddits_to_search = SUBREDDITS[:5]
        queries_to_search = PROBLEM_QUERIES[:4]

        for subreddit in subreddits_to_search:
            for query in queries_to_search:
                posts = _search_subreddit(subreddit, query, limit=5)
                for post in posts:
                    if _is_seen(post["url"]):
                        continue
                    if not _is_significant(post):
                        _save_finding(post, query)
                        continue
                    _save_finding(post, query)
                    all_posts.append(post)

        if not all_posts:
            logger.info("No new significant Reddit findings.")
            return 0

        logger.info(f"Found {len(all_posts)} significant new post(s).")

        # Cluster similar posts
        clusters = _cluster_by_topic(all_posts)

        count = 0
        for topic_key, posts in clusters.items():
            total_score = sum(p["score"] for p in posts)
            total_comments = sum(p["num_comments"] for p in posts)
            best_post = max(posts, key=lambda p: p["score"])

            # --- Phase 1: Knowledge Base Update (always) ---
            thema = _extract_thema(topic_key)
            for post in posts:
                update_knowledge_base(
                    thema=thema,
                    quelle="reddit",
                    fund={
                        "title": post["title"],
                        "url": post["url"],
                        "text": post.get("selftext", ""),
                        "score": post["score"],
                        "num_comments": post["num_comments"],
                        "subreddit": post.get("subreddit", ""),
                    },
                    config=config,
                )

            # --- Phase 2: Match against own projects ---
            combined_text = " ".join(
                p["title"] + " " + p.get("selftext", "")[:200] for p in posts
            )
            project_matches = match_projects(combined_text)

            if project_matches:
                # Create opportunity proposal for the best matching project
                best_match = project_matches[0]
                created = create_opportunity_proposal(
                    thema=thema,
                    fund={
                        "title": best_post["title"],
                        "url": best_post["url"],
                        "text": best_post.get("selftext", ""),
                        "score": best_post["score"],
                        "num_comments": best_post["num_comments"],
                        "subreddit": best_post.get("subreddit", ""),
                    },
                    project_match=best_match,
                    quelle="reddit",
                )
                if created:
                    count += 1
            else:
                # No project match, but still create analysis proposal
                # if the problem is significant enough
                if total_score >= 50 or len(posts) >= 3:
                    short_title = topic_key[:40]
                    if not has_pending_proposal("marktforschung", short_title):
                        prompt = _build_analysis_prompt(topic_key, posts)
                        create_proposal(
                            helferlein="marktforschung",
                            title=f"Reddit: {topic_key[:80]}",
                            description=(
                                f"Problem-Cluster ({len(posts)} Posts, "
                                f"Score: {total_score}, Kommentare: {total_comments}):\n\n"
                                + "\n".join(
                                    f"- [{p['subreddit']}] {p['title']} ({p['score']} pts)"
                                    for p in posts[:3]
                                )
                            ),
                            priority="high" if total_score >= 100 else "normal",
                            action_type="draft",
                            evidence=[p["url"] for p in posts[:5]],
                            prepared_prompt=prompt,
                            prepared_plan=(
                                f"1. Problem analysieren\n"
                                f"2. Bestehende Loesungen recherchieren\n"
                                f"3. App-Idee wenn Luecke\n"
                                f"4. Marktpotenzial DACH"
                            ),
                        )
                        count += 1

        return count


def _extract_thema(title: str) -> str:
    """Extract a clean topic name from a Reddit post title."""
    # Remove common prefixes/noise
    thema = title.strip()
    for prefix in ["[Rant]", "[OC]", "Frage:", "Hilfe:"]:
        thema = thema.replace(prefix, "").strip()
    # Truncate
    if len(thema) > 80:
        thema = thema[:77] + "..."
    return thema
