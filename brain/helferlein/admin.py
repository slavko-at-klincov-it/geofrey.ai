"""Admin-Helferlein -- checks AIBuchhalter for pending actions.

Connects to AIBuchhalter REST API (localhost:5050) to check:
- Inactive customers needing follow-up
- Overdue payment reminders
- Open invoices that need attention

Creates proposals for actions the user should take.
"""

import logging
from datetime import datetime

import requests

from brain.helferlein import register
from brain.proposals import create_proposal, has_pending_proposal

logger = logging.getLogger("geofrey.helferlein.admin")

BUCHHALTER_URL = "http://localhost:5050"
TIMEOUT = 10


def _api_get(endpoint: str) -> dict | list | None:
    """GET request to AIBuchhalter API. Returns None on failure."""
    try:
        r = requests.get(f"{BUCHHALTER_URL}{endpoint}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        logger.warning(f"AIBuchhalter {endpoint}: HTTP {r.status_code}")
        return None
    except requests.ConnectionError:
        logger.info("AIBuchhalter not running (connection refused).")
        return None
    except Exception as e:
        logger.warning(f"AIBuchhalter {endpoint}: {e}")
        return None


@register
class AdminHelferlein:
    """Checks AIBuchhalter for pending customer/invoice actions."""

    name = "admin"

    def run(self, config: dict) -> int:
        """Run admin checks. Returns number of proposals created."""
        # Quick health check
        status = _api_get("/api/profil")
        if status is None:
            logger.info("AIBuchhalter not reachable, skipping admin checks.")
            return 0

        count = 0
        count += self._check_inactive_customers()
        count += self._check_contact_reminders()
        count += self._check_open_invoices()
        return count

    def _check_inactive_customers(self) -> int:
        """Find customers with no recent interaction."""
        data = _api_get("/api/inaktive-kunden")
        if not data or not isinstance(data, list):
            return 0

        count = 0
        for kunde in data[:5]:  # Max 5 proposals per run
            name = f"{kunde.get('vorname', '')} {kunde.get('nachname', '')}".strip()
            firma = kunde.get("firma", "")
            letzte_interaktion = kunde.get("letzte_interaktion", "Unbekannt")
            tage = kunde.get("tage_seit_kontakt", "?")

            display_name = f"{name}" + (f" ({firma})" if firma else "")

            create_proposal(
                helferlein="admin",
                title=f"Follow-up: {display_name}, {tage} Tage kein Kontakt",
                description=(
                    f"Kunde: {display_name}\n"
                    f"Letzter Kontakt: {letzte_interaktion}\n"
                    f"Tage seit Kontakt: {tage}\n\n"
                    f"Status: {kunde.get('status', '?')}\n"
                    f"Branche: {kunde.get('branche', '?')}\n"
                    f"Tags: {', '.join(kunde.get('tags', []))}"
                ),
                priority="normal",
                action_type="notify",
            )
            count += 1

        if count:
            logger.info(f"{count} inactive customer proposal(s)")
        return count

    def _check_contact_reminders(self) -> int:
        """Check scheduled follow-up reminders."""
        data = _api_get("/api/kontakt-erinnerungen")
        if not data or not isinstance(data, list):
            return 0

        count = 0
        for reminder in data[:5]:
            name = f"{reminder.get('vorname', '')} {reminder.get('nachname', '')}".strip()
            betreff = reminder.get("betreff", "Follow-up")
            datum = reminder.get("follow_up_datum", "")

            create_proposal(
                helferlein="admin",
                title=f"Erinnerung: {name}, {betreff}",
                description=(
                    f"Follow-up Erinnerung fuer {name}:\n"
                    f"Betreff: {betreff}\n"
                    f"Datum: {datum}"
                ),
                priority="normal",
                action_type="notify",
            )
            count += 1

        return count

    def _check_open_invoices(self) -> int:
        """Check for overdue open invoices."""
        data = _api_get("/api/offene-forderungen")
        if not data or not isinstance(data, list):
            return 0

        today = datetime.now().date()
        overdue = []
        for invoice in data:
            faellig = invoice.get("faellig_am")
            if not faellig:
                continue
            try:
                due_date = datetime.fromisoformat(faellig).date()
                if due_date < today:
                    days_overdue = (today - due_date).days
                    invoice["days_overdue"] = days_overdue
                    overdue.append(invoice)
            except (ValueError, TypeError):
                continue

        if not overdue:
            return 0

        # Sort by most overdue first
        overdue.sort(key=lambda x: x.get("days_overdue", 0), reverse=True)

        # Create one summary proposal for all overdue invoices
        lines = []
        for inv in overdue[:10]:
            kunde = inv.get("kunde") or inv.get("lieferant") or "Unbekannt"
            betrag = inv.get("brutto", "?")
            tage = inv.get("days_overdue", "?")
            lines.append(f"  - {kunde}: {betrag} EUR, {tage} Tage ueberfaellig")

        create_proposal(
            helferlein="admin",
            title=f"{len(overdue)} ueberfaellige Rechnung(en)",
            description=(
                f"Folgende Rechnungen sind ueberfaellig:\n\n"
                + "\n".join(lines)
                + f"\n\nGesamt: {len(overdue)} Rechnung(en)"
            ),
            priority="high" if any(inv.get("days_overdue", 0) > 30 for inv in overdue) else "normal",
            action_type="notify",
        )
        logger.info(f"{len(overdue)} overdue invoice(s)")
        return 1
