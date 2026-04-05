"""Content-Helferlein -- website scanner + LinkedIn draft generator.

Checks if klincovit-website/projects.html is up to date with actual
projects in ~/Code/. Creates proposals for missing projects.

Also generates LinkedIn post drafts based on research findings.
"""

import logging
import re
from pathlib import Path

from brain.helferlein import register
from brain.proposals import create_proposal, has_pending_proposal

logger = logging.getLogger("geofrey.helferlein.content")

# Projects that should NOT appear on the website (internal/utility)
EXCLUDED_PROJECTS = {
    "ClaudeCodeCLIZugriffAufTerminal",
    "Neuer Ordner",
    "Meus-Tests",
    "LinkedIn_Posts",
    "Crawl_Speaker_Sessions",
    "Enterprise_architect_speaker_Session",
    "ETC_Projekt_CopilotSchulungen",
    "CRM",
    "knowledge-assistant",   # Merged into geofrey
    "CLI_Maestro",           # Merged into geofrey
    "LinkedIn_Automat",      # Merged into geofrey
    "2ndMe",
    "ANE-PersonalAI",
    "Meus-Website",
    "geofrey-website",
}

# Map from directory name to display info for projects that SHOULD be on website
# but currently aren't. Only projects with real substance get listed here.
KNOWN_PROJECTS = {
    "copyVoice": {
        "badge": "Tool",
        "title": "copyVoice",
        "description": "Voice Cloning mit Qwen3-TTS auf Apple Silicon. "
                       "15 Sekunden Referenz-Audio reichen um deine Stimme zu klonen.",
        "tech": ["Python", "Qwen3-TTS", "MLX", "Apple Silicon"],
        "highlight": "1.7B Parameter Modell, lokal auf Mac, keine Cloud",
    },
    "decision-guard": {
        "badge": "Plugin",
        "title": "Decision Guard",
        "description": "Claude Code Plugin das verhindert dass KI absichtliche "
                       "Architektur-Entscheidungen rückgängig macht. Zero Dependencies.",
        "tech": ["Markdown", "YAML", "Shell", "Claude Code"],
        "highlight": "4 Skills + 5 Hooks, automatisches Decision-Logging",
    },
    "Lael-LocalAIEventLog": {
        "badge": "Developer Tool",
        "title": "Lael",
        "description": "Native macOS App die alle lokalen KI-Modelle überwacht. "
                       "Menu Bar + Widgets + 14 unterstützte Runtimes.",
        "tech": ["Swift", "SwiftUI", "SwiftData", "WidgetKit"],
        "highlight": "14+ Runtime-Typen, RAM-Alerts, Desktop Widgets",
    },
}


def _parse_website_projects(website_path: Path) -> set[str]:
    """Parse project titles from projects.html."""
    projects_html = website_path / "projects.html"
    if not projects_html.exists():
        return set()

    content = projects_html.read_text(encoding="utf-8")
    titles = re.findall(
        r'class="project-card__title">(.*?)</h3>',
        content,
    )
    return {t.strip() for t in titles}


def _scan_code_projects(workspace: Path) -> dict[str, dict]:
    """Scan ~/Code/ for projects with README or CLAUDE.md.

    Returns dict of dirname -> project info.
    """
    projects = {}
    for d in sorted(workspace.iterdir()):
        if not d.is_dir():
            continue
        if d.name.startswith("."):
            continue
        if d.name in EXCLUDED_PROJECTS:
            continue

        # Must have at least a README or CLAUDE.md
        has_readme = (d / "README.md").exists()
        has_claude = (d / "CLAUDE.md").exists()
        if not has_readme and not has_claude:
            continue

        projects[d.name] = {
            "path": str(d),
            "has_readme": has_readme,
            "has_claude": has_claude,
        }
    return projects


def _build_add_project_prompt(dirname: str, info: dict) -> str:
    """Build a Claude Code CLI prompt to add a project card to projects.html."""
    return (
        f"Fuege ein neues Projekt '{info['title']}' zur projects.html Seite hinzu.\n\n"
        f"Die bestehenden Projekt-Cards als Vorlage nutzen (gleiche HTML-Struktur).\n\n"
        f"Details:\n"
        f"- Badge: {info['badge']}\n"
        f"- Title: {info['title']}\n"
        f"- Description: {info['description']}\n"
        f"- Tech Tags: {', '.join(info['tech'])}\n"
        f"- Highlight: {info['highlight']}\n\n"
        f"Die Card soll als letztes in der project__grid eingefuegt werden, "
        f"vor dem schliessenden </div> des Grids.\n\n"
        f"Sprache: Deutsch. Kein Emoji im Text. "
        f"Reveal-Klasse: 'reveal reveal-delay-N' (N = naechste Nummer).\n\n"
        f"WICHTIG: Nur die HTML-Datei projects.html aendern, nichts anderes."
    )


@register
class ContentHelferlein:
    """Checks website content against actual project state."""

    name = "content"

    def run(self, config: dict) -> int:
        """Run website scanner. Returns number of proposals created."""
        workspace = Path(config.get("workspace", "~/Code")).expanduser()
        website_path = workspace / "klincovit-website"

        if not website_path.exists():
            logger.warning("klincovit-website not found.")
            return 0

        count = 0
        count += self._check_missing_projects(workspace, website_path)
        return count

    def _check_missing_projects(self, workspace: Path, website_path: Path) -> int:
        """Find projects in ~/Code/ that are not on the website."""
        on_website = _parse_website_projects(website_path)
        in_code = _scan_code_projects(workspace)

        count = 0
        for dirname, info in in_code.items():
            # Check if this project is already on the website (by title match)
            known = KNOWN_PROJECTS.get(dirname)
            if known:
                title = known["title"]
            else:
                title = dirname

            # Fuzzy match: check if any website title contains this project name
            already_listed = any(
                title.lower() in wt.lower() or wt.lower() in title.lower()
                for wt in on_website
            )
            if already_listed:
                continue

            # Only create proposals for projects we have display info for
            if dirname not in KNOWN_PROJECTS:
                logger.debug(f"Skipping {dirname}: no display info configured.")
                continue

            project_info = KNOWN_PROJECTS[dirname]

            # Skip if we already have a pending proposal for this
            if has_pending_proposal("content", project_info["title"]):
                logger.debug(f"Skipping {dirname}: proposal already exists.")
                continue
            prompt = _build_add_project_prompt(dirname, project_info)
            plan = (
                f"1. projects.html oeffnen\n"
                f"2. Neue project-card fuer '{project_info['title']}' einfuegen\n"
                f"3. HTML-Struktur der bestehenden Cards als Vorlage\n"
                f"4. Tech-Tags: {', '.join(project_info['tech'])}"
            )

            create_proposal(
                helferlein="content",
                title=f"Website: {project_info['title']} fehlt auf projects.html",
                description=(
                    f"Das Projekt '{project_info['title']}' existiert in ~/Code/{dirname} "
                    f"aber fehlt auf der Website klincov.it/projects.html.\n\n"
                    f"Beschreibung: {project_info['description']}\n"
                    f"Tech: {', '.join(project_info['tech'])}"
                ),
                priority="normal",
                action_type="change",
                prepared_prompt=prompt,
                prepared_plan=plan,
                project="klincovit-website",
                project_path=str(website_path),
            )
            count += 1
            logger.info(f"Proposal: {project_info['title']} fehlt auf Website")

        return count
