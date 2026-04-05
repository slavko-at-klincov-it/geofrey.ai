"""Akquise-Helferlein -- crawls freelancer platforms for relevant projects.

Uses Playwright (headless browser) to crawl:
- FreelancerMap.at
- Freelando.de

Searches for projects matching Slavko's skills, extracts listings,
and creates proposals with draft application texts.

The application text is generated via Claude Code CLI (Sonnet) to
get quality drafts without using local LLM credits.

Requires: pip install playwright && playwright install chromium
"""

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from brain.helferlein import register
from brain.proposals import create_proposal
from brain.queue import DEFAULT_DB_PATH

logger = logging.getLogger("geofrey.helferlein.akquise")

# Search terms for relevant projects
SEARCH_TERMS = [
    "Power Platform",
    "Power Automate",
    "Power Apps",
    "Microsoft 365",
    "Copilot Studio",
    "KI Beratung",
    "AI Consulting",
]

# Platforms to crawl
PLATFORMS = {
    "freelancermap": {
        "base_url": "https://www.freelancermap.at",
        "search_url": "https://www.freelancermap.at/projektboerse.html?query={query}&countries%5B%5D=1&countries%5B%5D=2&countries%5B%5D=3",
    },
    "freelando": {
        "base_url": "https://www.freelando.de",
        "search_url": "https://www.freelando.de/projekte?q={query}",
    },
}


def _init_opportunities_table(db_path: str | None = None) -> None:
    """Create opportunities table for tracking seen/applied listings."""
    db_path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS opportunities (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            description TEXT,
            location TEXT,
            budget TEXT,
            start_date TEXT,
            status TEXT DEFAULT 'new',
            found_at TEXT,
            applied_at TEXT,
            application_text TEXT
        )
    """)
    conn.commit()
    conn.close()


def _is_known_opportunity(url: str, db_path: str | None = None) -> bool:
    """Check if we've already seen this listing."""
    db_path = db_path or DEFAULT_DB_PATH
    _init_opportunities_table(db_path)
    conn = sqlite3.connect(db_path, timeout=5.0)
    row = conn.execute("SELECT id FROM opportunities WHERE url = ?", (url,)).fetchone()
    conn.close()
    return row is not None


def _save_opportunity(
    platform: str, title: str, url: str,
    description: str = "", location: str = "", budget: str = "",
    db_path: str | None = None,
) -> str:
    """Save a new opportunity to the database."""
    db_path = db_path or DEFAULT_DB_PATH
    _init_opportunities_table(db_path)
    opp_id = uuid4().hex[:12]
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.execute(
        """INSERT INTO opportunities
           (id, platform, title, url, description, location, budget, status, found_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)""",
        (opp_id, platform, title, url, description, location, budget,
         datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return opp_id


def _crawl_freelancermap(query: str) -> list[dict]:
    """Crawl FreelancerMap.at for project listings.

    Returns list of {title, url, description, location, budget}.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("Playwright not installed. Run: pip install playwright && playwright install chromium")
        return []

    url = PLATFORMS["freelancermap"]["search_url"].format(query=query.replace(" ", "+"))
    results = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, timeout=30000)
            page.wait_for_timeout(2000)

            # FreelancerMap project cards
            cards = page.query_selector_all(".project-card, .project-list-item, [class*='project']")
            if not cards:
                # Fallback: try generic listing selectors
                cards = page.query_selector_all(".list-item, .search-result, article")

            for card in cards[:10]:  # Max 10 per query
                try:
                    title_el = card.query_selector("h2, h3, .title, a[class*='title']")
                    link_el = card.query_selector("a[href*='projekt']") or card.query_selector("a")
                    desc_el = card.query_selector("p, .description, .text")
                    loc_el = card.query_selector(".location, .ort, [class*='location']")

                    title = title_el.inner_text().strip() if title_el else ""
                    href = link_el.get_attribute("href") if link_el else ""
                    desc = desc_el.inner_text().strip()[:500] if desc_el else ""
                    location = loc_el.inner_text().strip() if loc_el else ""

                    if not title or not href:
                        continue

                    if not href.startswith("http"):
                        href = PLATFORMS["freelancermap"]["base_url"] + href

                    results.append({
                        "title": title,
                        "url": href,
                        "description": desc,
                        "location": location,
                        "platform": "freelancermap",
                    })
                except Exception:
                    continue

            browser.close()

    except Exception as e:
        logger.warning(f"FreelancerMap crawl failed for '{query}': {e}")

    return results


def _crawl_freelando(query: str) -> list[dict]:
    """Crawl Freelando.de for project listings."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return []

    url = PLATFORMS["freelando"]["search_url"].format(query=query.replace(" ", "+"))
    results = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, timeout=30000)
            page.wait_for_timeout(2000)

            cards = page.query_selector_all(".project-item, .list-item, article, [class*='project']")
            if not cards:
                cards = page.query_selector_all(".search-result, .result-item")

            for card in cards[:10]:
                try:
                    title_el = card.query_selector("h2, h3, .title, a")
                    link_el = card.query_selector("a[href*='projekt']") or card.query_selector("a")
                    desc_el = card.query_selector("p, .description")

                    title = title_el.inner_text().strip() if title_el else ""
                    href = link_el.get_attribute("href") if link_el else ""
                    desc = desc_el.inner_text().strip()[:500] if desc_el else ""

                    if not title or not href:
                        continue

                    if not href.startswith("http"):
                        href = PLATFORMS["freelando"]["base_url"] + href

                    results.append({
                        "title": title,
                        "url": href,
                        "description": desc,
                        "platform": "freelando",
                    })
                except Exception:
                    continue

            browser.close()

    except Exception as e:
        logger.warning(f"Freelando crawl failed for '{query}': {e}")

    return results


def _build_application_prompt(listing: dict) -> str:
    """Build Claude Code CLI prompt to draft an application text."""
    return (
        f"Du bist Slavko Klincov, freiberuflicher Power Platform & KI-Berater.\n"
        f"Website: klincov.it\n\n"
        f"Schreibe einen professionellen Bewerbungstext fuer folgendes Projekt:\n\n"
        f"Titel: {listing['title']}\n"
        f"Plattform: {listing.get('platform', '?')}\n"
        f"Beschreibung: {listing.get('description', 'Keine Details')}\n"
        f"Ort: {listing.get('location', 'Remote/DACH')}\n\n"
        f"Anforderungen an den Text:\n"
        f"- Deutsch, professionell, persoenlich (nicht generisch)\n"
        f"- Referenz auf relevante Erfahrung (Power Platform bei Gebrueder Weiss, "
        f"KI-Projekte wie AIBuchhalter, Meus)\n"
        f"- Kurz (max 200 Worte)\n"
        f"- Kein Emoji, keine Em-Dashes\n"
        f"- Abschluss: Verfuegbarkeit und Kontaktdaten\n\n"
        f"Gib NUR den Bewerbungstext aus, keine Erklaerungen."
    )


@register
class AkquiseHelferlein:
    """Crawls freelancer platforms for relevant project opportunities."""

    name = "akquise"

    def run(self, config: dict) -> int:
        """Run platform crawl. Returns number of proposals created."""
        count = 0

        for query in SEARCH_TERMS[:3]:  # Limit queries per run
            # Crawl platforms
            listings = []
            listings.extend(_crawl_freelancermap(query))
            listings.extend(_crawl_freelando(query))

            for listing in listings:
                # Skip if we've seen this before
                if _is_known_opportunity(listing["url"]):
                    continue

                # Save to DB
                _save_opportunity(
                    platform=listing.get("platform", "?"),
                    title=listing["title"],
                    url=listing["url"],
                    description=listing.get("description", ""),
                    location=listing.get("location", ""),
                )

                # Create proposal with application draft prompt
                prompt = _build_application_prompt(listing)
                platform = listing.get("platform", "?")

                create_proposal(
                    helferlein="akquise",
                    title=f"{platform}: {listing['title'][:80]}",
                    description=(
                        f"Neues Projekt auf {platform}:\n\n"
                        f"Titel: {listing['title']}\n"
                        f"URL: {listing['url']}\n"
                        f"Ort: {listing.get('location', 'k.A.')}\n\n"
                        f"{listing.get('description', '')}"
                    ),
                    priority="normal",
                    action_type="apply",
                    evidence=[listing["url"]],
                    prepared_prompt=prompt,
                    prepared_plan=(
                        f"1. Bewerbungstext generieren lassen\n"
                        f"2. Text pruefen und anpassen\n"
                        f"3. Auf {platform} bewerben: {listing['url']}"
                    ),
                )
                count += 1
                logger.info(f"New opportunity: {listing['title'][:60]}")

        return count
