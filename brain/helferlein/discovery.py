"""Project Discovery -- scannt ~/Code/ und baut PROJECT_CAPABILITIES automatisch.

Statt Projekte und ihre Keywords hardcoded zu pflegen, scannt dieses
Modul die tatsächlichen Projekte und extrahiert:
- Name + Beschreibung aus CLAUDE.md / README.md
- Tech Stack aus requirements.txt / package.json / CLAUDE.md
- Keywords aus dem gesamten Text

Das Ergebnis wird als JSON gecached und von intelligence.py genutzt.
Der Cache wird bei jedem Overnight-Lauf aktualisiert.
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("geofrey.discovery")

CACHE_PATH = Path.home() / ".knowledge" / "project_capabilities.json"

# Directories to skip
SKIP_DIRS = {
    ".git", ".venv", "node_modules", "__pycache__", ".next",
    "build", "dist", "Backup", "Notes", "Neuer Ordner",
}

# Known project URLs (can't be auto-detected from files)
KNOWN_URLS = {
    "aibuchhalter": "klincov.it",
    "meus": "meus.info",
    "anomyze-extension": "anomyze.it",
    "klincovit-website": "klincov.it",
    "geofrey": "geofrey.ai",
}


def scan_all_projects(workspace: str = "~/Code") -> dict[str, dict]:
    """Scan all projects in workspace and extract capabilities.

    Returns dict of project_name -> {keywords, beschreibung, tech, zielgruppe, url}.
    """
    workspace_path = Path(workspace).expanduser()
    if not workspace_path.exists():
        logger.warning(f"Workspace {workspace} not found.")
        return {}

    capabilities = {}

    for project_dir in sorted(workspace_path.iterdir()):
        if not project_dir.is_dir():
            continue
        if project_dir.name.startswith("."):
            continue
        if project_dir.name in SKIP_DIRS:
            continue

        cap = _scan_project(project_dir)
        if cap:
            capabilities[project_dir.name.lower()] = cap

    return capabilities


def _scan_project(project_dir: Path) -> dict | None:
    """Scan a single project and extract capabilities."""
    claude_md = _read_file(project_dir / "CLAUDE.md")
    readme = _read_file(project_dir / "README.md")

    # Must have at least one doc file
    if not claude_md and not readme:
        return None

    # Best source: CLAUDE.md (more structured), fallback README.md
    primary_doc = claude_md or readme
    all_text = (claude_md + "\n" + readme).strip()

    # Extract info
    beschreibung = _extract_description(primary_doc, project_dir.name)
    tech = _extract_tech_stack(project_dir, all_text)
    keywords = _extract_keywords(all_text, tech, project_dir.name)

    if not beschreibung or len(keywords) < 3:
        return None

    return {
        "keywords": keywords,
        "beschreibung": beschreibung,
        "tech": tech,
        "url": KNOWN_URLS.get(project_dir.name.lower(), ""),
        "zielgruppe": "",  # Hard to auto-detect, left empty
        "path": str(project_dir),
        "scanned_at": datetime.now().isoformat(),
    }


def _read_file(path: Path, max_bytes: int = 20000) -> str:
    """Read a file, return empty string if not found."""
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8")
        return text[:max_bytes]
    except Exception:
        return ""


def _extract_description(doc: str, project_name: str) -> str:
    """Extract a one-line description from a doc file."""
    lines = doc.strip().splitlines()

    # Strategy 1: First paragraph after the title
    in_content = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#") and not in_content:
            in_content = True
            continue
        if in_content and stripped and not stripped.startswith("#") and not stripped.startswith("---"):
            # Clean up markdown
            desc = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', stripped)
            desc = re.sub(r'[*_`]', '', desc)
            if len(desc) > 20:
                return desc[:200]

    # Strategy 2: First non-empty, non-heading line
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and not stripped.startswith("---") and len(stripped) > 20:
            return stripped[:200]

    return f"{project_name} project"


def _extract_tech_stack(project_dir: Path, all_text: str) -> list[str]:
    """Extract tech stack from project files and documentation."""
    tech = set()

    # From files present
    if (project_dir / "requirements.txt").exists():
        tech.add("Python")
        reqs = _read_file(project_dir / "requirements.txt", 5000)
        for pkg in ["flask", "fastapi", "django", "ollama", "chromadb",
                     "torch", "pytorch", "tensorflow", "playwright",
                     "langchain", "openai", "anthropic"]:
            if pkg in reqs.lower():
                tech.add(pkg.capitalize())
    if (project_dir / "pyproject.toml").exists():
        tech.add("Python")
    if (project_dir / "package.json").exists():
        tech.add("Node.js")
        pkg = _read_file(project_dir / "package.json", 5000)
        if "react-native" in pkg or "expo" in pkg:
            tech.add("React Native")
        if "react" in pkg:
            tech.add("React")
        if "electron" in pkg:
            tech.add("Electron")
        if "typescript" in pkg.lower():
            tech.add("TypeScript")
    if (project_dir / "Cargo.toml").exists():
        tech.add("Rust")
    if list(project_dir.glob("*.swift")) or (project_dir / "Package.swift").exists():
        tech.add("Swift")
    if list(project_dir.glob("*.xcodeproj")) or list(project_dir.glob("*.xcworkspace")):
        tech.add("Xcode")
    if (project_dir / "index.html").exists() or list(project_dir.glob("*.html")):
        tech.add("HTML")

    # From doc text
    tech_patterns = {
        "Ollama": r'\bollama\b',
        "ChromaDB": r'\bchromadb\b',
        "SQLite": r'\bsqlite\b',
        "FastAPI": r'\bfastapi\b',
        "Flask": r'\bflask\b',
        "SwiftUI": r'\bswiftui\b',
        "CoreML": r'\bcoreml\b',
        "MLX": r'\bmlx\b',
        "Whisper": r'\bwhisper\b',
        "Playwright": r'\bplaywright\b',
        "Tesseract": r'\btesseract\b',
        "Apple Neural Engine": r'apple neural engine|ane',
    }
    text_lower = all_text.lower()
    for name, pattern in tech_patterns.items():
        if re.search(pattern, text_lower):
            tech.add(name)

    return sorted(tech)


def _extract_keywords(all_text: str, tech: list[str], project_name: str) -> list[str]:
    """Extract relevant keywords from project documentation."""
    keywords = set()

    # Add tech stack as keywords (lowercase)
    for t in tech:
        keywords.add(t.lower())

    # Add project name variants
    keywords.add(project_name.lower())
    keywords.add(project_name.lower().replace("-", " "))
    keywords.add(project_name.lower().replace("_", " "))

    # Extract significant words from text (4+ chars, appear 2+ times)
    text_lower = all_text.lower()
    words = re.findall(r'\b[a-zäöüß]{4,}\b', text_lower)
    word_counts = {}
    for w in words:
        word_counts[w] = word_counts.get(w, 0) + 1

    # Words that appear 3+ times are likely important
    for word, count in word_counts.items():
        if count >= 3 and word not in _STOPWORDS:
            keywords.add(word)

    # Extract specific domain terms (bigrams)
    bigrams = re.findall(
        r'\b((?:power|apple|neural|local|on-device|open.source|self.host|voice|speech|'
        r'machine|deep|fine.tun|text.to|react.native|low.code|no.code|'
        r'second.brain|knowledge.base|real.time)\s+\w+)\b',
        text_lower,
    )
    for bg in bigrams:
        keywords.add(bg.strip())

    return sorted(keywords)[:50]  # Max 50 keywords per project


# Common German + English stopwords to filter out
_STOPWORDS = {
    "dann", "wenn", "dass", "wird", "werden", "wurde", "sind", "sein",
    "haben", "hatte", "kann", "soll", "muss", "alle", "auch", "aber",
    "oder", "nicht", "eine", "einen", "einer", "einem", "diese",
    "dieser", "dieses", "nach", "noch", "mehr", "schon", "sehr",
    "über", "unter", "zwischen", "durch", "andere", "anderen",
    "with", "that", "this", "from", "they", "will", "have", "been",
    "which", "when", "what", "your", "each", "than", "them",
    "other", "into", "only", "some", "such", "most", "does",
    "should", "could", "would", "about", "their", "there",
    "true", "false", "none", "default", "return", "import",
    "class", "self", "args", "kwargs", "string", "value",
    "name", "path", "file", "line", "code", "function",
    "print", "list", "dict", "type", "status", "error",
}


def save_capabilities_cache(capabilities: dict) -> None:
    """Save scanned capabilities to JSON cache."""
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "scanned_at": datetime.now().isoformat(),
        "project_count": len(capabilities),
        "projects": capabilities,
    }
    CACHE_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Saved {len(capabilities)} project capabilities to cache.")


def load_capabilities_cache() -> dict[str, dict]:
    """Load cached capabilities. Returns empty dict if no cache."""
    if not CACHE_PATH.exists():
        return {}
    try:
        data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        return data.get("projects", {})
    except Exception:
        return {}


def refresh_capabilities(workspace: str = "~/Code") -> dict[str, dict]:
    """Scan projects, save cache, return capabilities.

    Called during overnight run to keep capabilities fresh.
    """
    capabilities = scan_all_projects(workspace)
    save_capabilities_cache(capabilities)
    return capabilities
