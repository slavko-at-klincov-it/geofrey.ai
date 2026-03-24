# Microsoft EU Data Boundary

## Überblick
- **Was:** Microsoft speichert und verarbeitet Kundendaten von EU/EFTA-Kunden innerhalb der EU-Grenze
- **Seit:** Phase 1 seit Januar 2023, Phase 2 seit Januar 2024, Phase 3 laufend
- **Betrifft:** Microsoft 365, Azure, Dynamics 365, Power Platform

## Was ist abgedeckt?
- **Kundendaten (Customer Data):** Dokumente, E-Mails, SharePoint-Inhalte, Teams-Chats
- **Pseudonymisierte Daten:** Seit Phase 2 auch Diagnosedaten innerhalb der EU
- **Supportdaten:** Bei EU-Support-Anfragen bleiben Daten in der EU

## Was ist NICHT abgedeckt?
- **Entra ID (Azure AD):** Verzeichnisdaten werden teilweise global repliziert
- **Security-Daten:** Microsoft Defender, Sentinel — teilweise globale Verarbeitung nötig
- **Einige Legacy-Dienste:** Nicht alle M365-Dienste sind vollständig migriert

## Relevanz für DACH-Kunden
- Für DSGVO-Compliance wichtig: Datenresidenz in der EU ist ein Kernargument
- AVV (Auftragsverarbeitungsvertrag) mit Microsoft vorhanden: DPA im Microsoft Trust Center
- Schrems II / Angemessenheitsbeschluss: EU-US Data Privacy Framework seit Juli 2023
- Österreichische/Deutsche Behörden akzeptieren M365 unter bestimmten Bedingungen (TOMs dokumentieren)
- Schweiz: Eigener Angemessenheitsbeschluss, nDSG-konform

## Power Platform spezifisch
- Umgebungen können auf EU-Region (Europe) eingestellt werden
- Dataverse-Daten liegen in EU-Rechenzentren (Dublin, Amsterdam, Frankfurt, etc.)
- Copilot/AI-Features: Prüfen ob Daten für Training verwendet werden (Opt-Out möglich)
- DLP-Policies: Verhindern unbeabsichtigten Datenabfluss außerhalb der EU

## Argumentationshilfe für Kunden
- "Meine Daten liegen in der EU" — ja, mit EU Data Boundary
- "Microsoft liest meine Daten" — nein, vertraglich ausgeschlossen (DPA)
- "Ist M365 DSGVO-konform?" — ja, wenn korrekt konfiguriert und TOMs dokumentiert
