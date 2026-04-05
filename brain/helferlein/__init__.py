"""Helferlein system -- autonomous helpers that create proposals.

Each helferlein runs during the overnight cycle (or daytime polling),
gathers information, and creates proposals for user review.

Helferlein do NOT make changes. They research, check, crawl, and
prepare proposals with ready-to-execute Claude Code CLI prompts.
The user approves proposals in the dashboard, then Claude executes.
"""

import logging
from typing import Protocol

logger = logging.getLogger("geofrey.helferlein")


class Helferlein(Protocol):
    """Interface for all helferlein."""

    name: str

    def run(self, config: dict) -> int:
        """Run this helferlein. Returns number of proposals created."""
        ...


# Registry of active helferlein
_registry: list[type] = []


def register(cls: type) -> type:
    """Decorator to register a helferlein class."""
    _registry.append(cls)
    return cls


def run_all_helferlein(config: dict) -> int:
    """Run all registered helferlein. Returns total proposals created.

    Each helferlein is isolated -- one failure doesn't stop the others.
    """
    total = 0
    for cls in _registry:
        try:
            helferlein = cls()
            count = helferlein.run(config)
            total += count
            if count:
                logger.info(f"Helferlein '{helferlein.name}': {count} proposal(s)")
        except Exception as e:
            name = getattr(cls, "name", cls.__name__)
            logger.error(f"Helferlein '{name}' failed: {e}")
    return total
