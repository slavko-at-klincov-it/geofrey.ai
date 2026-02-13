import type { TranslationKey } from "../keys.js";

export const de: Record<TranslationKey, string> = {
  // app
  "app.claudeUnavailable": "Claude Code nicht verfügbar — Ollama-Tools funktionieren weiterhin.",
  "app.ollamaRetrying": "Ollama nicht erreichbar — Versuch {attempt}/3...",
  "app.ollamaNotReachable": "Ollama nicht erreichbar nach {attempts} Versuchen — starte mit 'ollama serve'",
  "app.ollamaConnectionError": "Ollama nicht erreichbar — starte mit 'ollama serve'",

  // approval / risk-classifier
  "approval.blockedCommand": "Gesperrter Befehl",
  "approval.blockedCommandPath": "Gesperrter Befehl (Pfad-Variante)",
  "approval.scriptNetwork": "Netzwerkzugriff via Script-Sprache",
  "approval.base64Decode": "Base64-Decode erkannt — mögliche Payload",
  "approval.chmodExec": "Ausführbar machen — Download-and-Run Muster",
  "approval.procSubstitution": "Prozess-Substitution erkannt",
  "approval.injectionPattern": "Injection-Muster erkannt",
  "approval.forcePush": "Force-Push überschreibt Remote irreversibel",
  "approval.bareShell": "Shell-Interpreter als Pipe-Ziel",
  "approval.sensitivePath": "Zugriff auf sensible Datei",
  "approval.configFile": "Config-Datei — Genehmigung erforderlich",
  "approval.readOnly": "Nur lesen, keine Änderung",
  "approval.llmFallback": "LLM-Klassifikation fehlgeschlagen — Fallback L2",
  "approval.noReason": "Keine Begründung",
  "approval.classifierLanguage": "German",

  // tools
  "tools.l3Blocked": "L3: Aktion blockiert — {reason}",
  "tools.executionFailed": "ERROR: {name} fehlgeschlagen — {msg}",

  // orchestrator
  "orchestrator.respondInstruction": "Respond to the user in {language}. Code, commands, and technical identifiers stay in English.",
  "orchestrator.language": "German",
  "orchestrator.ambiguousExample": "Ich nehme an, du möchtest...",
  "orchestrator.noResponse": "Keine Antwort.",
  "orchestrator.errorPrefix": "Fehler im Agent Loop: {msg}",
  "orchestrator.errorShort": "Fehler: {msg}",
  "orchestrator.tooManyErrors": "Zu viele aufeinanderfolgende Fehler ({count}). Bitte prüfe die Konfiguration oder versuche es erneut.",

  // messaging
  "messaging.claudeWorking": "Claude Code arbeitet...",
  "messaging.noOutput": "(no output)",
  "messaging.approvalRequired": "Genehmigung erforderlich",
  "messaging.actionLabel": "Aktion:",
  "messaging.riskLabel": "Risiko:",
  "messaging.detailsLabel": "Details:",
  "messaging.approve": "Genehmigen",
  "messaging.deny": "Ablehnen",
  "messaging.approved": "Genehmigt",
  "messaging.denied": "Abgelehnt",
  "messaging.processingError": "Fehler bei der Verarbeitung. Bitte versuche es erneut.",
  "messaging.signalInstruction": "Antworten Sie mit: 1 = Genehmigen, 2 = Ablehnen",

  // messaging - image
  "messaging.imageProcessing": "Bild wird verarbeitet...",
  "messaging.imageDownloadFailed": "Bild konnte nicht heruntergeladen werden. Bitte erneut versuchen.",
  "messaging.imageUnsupported": "Nicht unterstütztes Bildformat. Unterstützt: JPEG, PNG, WebP, TIFF, GIF.",
  "messaging.imageTooLarge": "Bild zu groß (max. {maxSize}).",
  "messaging.imageOcrFailed": "Texterkennung fehlgeschlagen — Bild wird ohne OCR-Text weitergeleitet.",

  // check
  "check.disabled": "Claude Code: Deaktiviert (CLAUDE_CODE_ENABLED=false)",
  "check.notFound": "Claude Code: FEHLER — 'claude' nicht gefunden",
  "check.notFoundInstall": "  → Installieren: npm install -g @anthropic-ai/claude-code",
  "check.notFoundDocs": "  → Docs: https://docs.anthropic.com/en/docs/claude-code",
  "check.noAuth": "Claude Code: FEHLER — Keine Authentifizierung",
  "check.authOptionA": "  → Option A: Claude Pro/Max/Teams/Enterprise Subscription → 'claude login'",
  "check.authOptionB": "  → Option B: API Key → ANTHROPIC_API_KEY in .env setzen",
  "check.authCreateKey": "  → API Key erstellen: https://console.anthropic.com/settings/keys",
  "check.okApiKey": "Claude Code: OK (API Key, {model})",
  "check.okSubscription": "Claude Code: OK (Subscription, {model})",

  // onboarding ui
  "onboarding.banner": "geofrey.ai Setup-Assistent",
  "onboarding.stepLabel": "Schritt {num}: {title}",

  // onboarding setup
  "onboarding.envCreated": ".env wurde erstellt",
  "onboarding.startNow": "Soll ich geofrey.ai jetzt starten?",
  "onboarding.starting": "Starte geofrey.ai...",
  "onboarding.startLater": "Starte später mit: pnpm dev",
  "onboarding.indexHint": "Tipp: Führe 'pnpm index' aus, um den Projekt-Index für bessere Prompts zu erstellen.",
  "onboarding.setupAborted": "Setup abgebrochen.",
  "onboarding.error": "Fehler:",

  // onboarding wizard
  "onboarding.nodeRequired": "Node.js 22+ ist erforderlich. Setup abgebrochen.",
  "onboarding.telegramAborted": "Telegram-Setup abgebrochen.",
  "onboarding.whatsappAborted": "WhatsApp-Setup abgebrochen.",
  "onboarding.signalAborted": "Signal-Setup abgebrochen.",
  "onboarding.configNotSaved": "Konfiguration wurde nicht gespeichert.",

  // prerequisites
  "onboarding.prereqTitle": "Voraussetzungen",
  "onboarding.nodeVersionFail": "Node.js {version} — Version 22+ erforderlich",
  "onboarding.pnpmNotFound": "pnpm nicht gefunden",
  "onboarding.ollamaRunning": "Ollama läuft ({url})",
  "onboarding.ollamaNotReachable": "Ollama nicht erreichbar",
  "onboarding.ollamaStart": "Ollama starten? (ollama serve)",
  "onboarding.ollamaStarting": "Ollama startet...",
  "onboarding.ollamaStarted": "Ollama läuft",
  "onboarding.ollamaStartFailed": "Ollama konnte nicht gestartet werden",
  "onboarding.ollamaStartManual": "Starte manuell: ollama serve",
  "onboarding.ollamaStartError": "Fehler beim Starten von Ollama",
  "onboarding.ollamaInstallHint": "Installieren: https://ollama.com",
  "onboarding.modelLoaded": "{model} geladen",
  "onboarding.modelNotLoaded": "Modell '{model}' nicht geladen",
  "onboarding.modelDownload": "Modell herunterladen? (~5 GB)",
  "onboarding.modelDownloading": "{model} wird heruntergeladen...",
  "onboarding.modelDownloadFailed": "Fehler beim Herunterladen von {model}",
  "onboarding.claudeCliFound": "Claude Code CLI {version}",
  "onboarding.claudeCliNotFound": "Claude Code CLI nicht gefunden",
  "onboarding.claudeCliInstall": "Claude Code installieren?",
  "onboarding.claudeCliInstalling": "Claude Code wird installiert...",
  "onboarding.claudeCliInstalled": "Claude Code installiert",
  "onboarding.claudeCliInstallFailed": "Installation fehlgeschlagen",

  // platform
  "onboarding.platformTitle": "Messaging-Plattform",
  "onboarding.platformPrompt": "Welche Plattform möchtest du nutzen?",
  "onboarding.platformTelegram": "Telegram (empfohlen)",
  "onboarding.platformWhatsApp": "WhatsApp Business",
  "onboarding.platformSignal": "Signal",

  // telegram setup
  "onboarding.telegramTitle": "Telegram einrichten",
  "onboarding.telegramHasBot": "Hast du bereits einen Telegram-Bot?",
  "onboarding.telegramHasBotYes": "Ja, ich habe einen Token",
  "onboarding.telegramHasBotNo": "Nein, ich brauche Anleitung",
  "onboarding.telegramCreateGuide": `
  So erstellst du einen Telegram-Bot:
  1. Öffne Telegram und suche nach @BotFather
  2. Sende /newbot
  3. Wähle einen Namen (z.B. "Geofrey AI")
  4. Wähle einen Username (z.B. "mein_geofrey_bot")
  5. BotFather gibt dir einen Token — kopiere ihn
`,
  "onboarding.tokenInputMethod": "Wie möchtest du den Bot-Token eingeben?",
  "onboarding.tokenDirect": "Direkt eintippen/einfügen",
  "onboarding.tokenClipboard": "Aus der Zwischenablage lesen",
  "onboarding.tokenOcr": "Aus einem Screenshot extrahieren (OCR)",
  "onboarding.tokenPrompt": "Bot-Token:",
  "onboarding.clipboardReading": "Zwischenablage wird gelesen...",
  "onboarding.clipboardFound": "Token in Zwischenablage gefunden",
  "onboarding.clipboardNotFound": "Kein Token in der Zwischenablage gefunden",
  "onboarding.tokenUseConfirm": "Token verwenden? ({preview}...)",
  "onboarding.ocrHint": "Erstelle einen Screenshot des Bot-Tokens...",
  "onboarding.screenshotFailed": "Screenshot konnte nicht erstellt werden",
  "onboarding.ocrExtracting": "Token wird aus Screenshot extrahiert...",
  "onboarding.ocrExtracted": "Token extrahiert",
  "onboarding.ocrNotFound": "Kein Token im Screenshot gefunden",
  "onboarding.retryPrompt": "Erneut versuchen?",
  "onboarding.tokenInvalid": "Ungültiges Token-Format (erwartet: 12345678:ABCD...)",
  "onboarding.tokenValidating": "Token wird validiert...",
  "onboarding.tokenBotFound": "Bot gefunden: @{username} ({name})",
  "onboarding.tokenRejected": "Token ungültig — Telegram hat den Token abgelehnt",
  "onboarding.autoDetectId": "Telegram-User-ID automatisch erkennen?",
  "onboarding.autoDetectSend": "Ich starte den Bot kurz — sende ihm eine Nachricht in Telegram.",
  "onboarding.autoDetectOpen": "→ Öffne: https://t.me/{username}",
  "onboarding.autoDetectWaiting": "Warte auf Nachricht an @{username}...",
  "onboarding.autoDetectReceived": "Nachricht empfangen von: {name}",
  "onboarding.autoDetectReply": "Deine ID ({id}) wurde erkannt!",
  "onboarding.autoDetectBotFail": "Bot konnte nicht gestartet werden",
  "onboarding.idConfirm": "Deine Telegram-ID: {id} — korrekt?",
  "onboarding.idManualHint": "Alternativ: Sende /start an @userinfobot um deine ID zu erfahren",
  "onboarding.idManualPrompt": "Telegram-User-ID:",
  "onboarding.idInvalid": "Ungültige User-ID",

  // whatsapp setup
  "onboarding.whatsappTitle": "WhatsApp Business einrichten",
  "onboarding.whatsappPrereqs": `
  Voraussetzungen:
  1. Meta Business Account + App erstellt
  2. WhatsApp Business API aktiviert
  3. Permanenter Access Token generiert
  → Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
`,
  "onboarding.phoneNumberId": "Phone Number ID:",
  "onboarding.phoneNumberIdMissing": "Phone Number ID fehlt",
  "onboarding.accessTokenPrompt": "Access Token:",
  "onboarding.accessTokenMissing": "Access Token fehlt",
  "onboarding.connectionCheck": "Verbindung wird geprüft...",
  "onboarding.whatsappConnected": "WhatsApp Business API verbunden",
  "onboarding.whatsappConnectionFailed": "API-Verbindung fehlgeschlagen — prüfe Phone Number ID und Access Token",
  "onboarding.networkError": "Netzwerkfehler bei der Validierung",
  "onboarding.continueAnyway": "Trotzdem fortfahren?",
  "onboarding.verifyTokenPrompt": "Webhook Verify Token (frei wählbar):",
  "onboarding.ownerPhonePrompt": "Deine Telefonnummer (mit Ländercode, z.B. 491234567890):",
  "onboarding.phoneMissing": "Telefonnummer fehlt",
  "onboarding.webhookPortPrompt": "Webhook Port:",
  "onboarding.whatsappPrivacyHint": "WICHTIG: Aktiviere 'Erweiterten Chat-Datenschutz' in WhatsApp",
  "onboarding.whatsappPrivacyPath": "→ Einstellungen > Datenschutz > Erweiterter Chat-Datenschutz",

  // signal setup
  "onboarding.signalTitle": "Signal einrichten",
  "onboarding.signalPrereqs": `
  Voraussetzungen:
  1. signal-cli installiert und registriert
  2. signal-cli im JSON-RPC Modus gestartet
  → Docs: https://github.com/AsamK/signal-cli
`,
  "onboarding.signalSocketFound": "signal-cli Socket gefunden: {path}",
  "onboarding.signalSocketNotFound": "Standard-Socket nicht gefunden: {path}",
  "onboarding.signalSocketPrompt": "Pfad zum signal-cli Socket:",
  "onboarding.signalConnected": "signal-cli verbunden",
  "onboarding.signalConnectionFailed": "Verbindung fehlgeschlagen",
  "onboarding.signalOwnerPhone": "Deine Telefonnummer (z.B. +491234567890):",
  "onboarding.signalBotPhone": "Bot-Telefonnummer (registriert bei signal-cli):",
  "onboarding.signalBotPhoneMissing": "Bot-Nummer fehlt",

  // claude auth
  "onboarding.claudeTitle": "Claude Code",
  "onboarding.claudeAuthPrompt": "Claude Code Authentifizierung:",
  "onboarding.claudeAuthApiKey": "API Key (ANTHROPIC_API_KEY)",
  "onboarding.claudeAuthSubscription": "Subscription (claude login)",
  "onboarding.claudeAuthSkip": "Überspringen",
  "onboarding.apiKeyInputMethod": "Wie möchtest du den API Key eingeben?",
  "onboarding.apiKeyDirect": "Direkt eintippen/einfügen",
  "onboarding.apiKeyClipboard": "Aus der Zwischenablage lesen",
  "onboarding.apiKeyOcr": "Aus einem Screenshot extrahieren (OCR)",
  "onboarding.apiKeyPrompt": "API Key:",
  "onboarding.apiKeyClipboardFound": "API Key in Zwischenablage gefunden",
  "onboarding.apiKeyClipboardNotFound": "Kein API Key in der Zwischenablage gefunden",
  "onboarding.apiKeyUseConfirm": "Key verwenden? ({preview}...)",
  "onboarding.apiKeyOcrHint": "Erstelle einen Screenshot des API Keys...",
  "onboarding.apiKeyOcrExtracting": "API Key wird aus Screenshot extrahiert...",
  "onboarding.apiKeyOcrExtracted": "API Key extrahiert",
  "onboarding.apiKeyOcrNotFound": "Kein API Key im Screenshot gefunden",
  "onboarding.apiKeyInvalid": "Ungültiges Key-Format (erwartet: sk-ant-...)",
  "onboarding.apiKeyValidating": "API Key wird validiert...",
  "onboarding.apiKeyValid": "API Key gültig",
  "onboarding.apiKeyRejected": "API Key ungültig — von Anthropic abgelehnt",
  "onboarding.claudeCliMissing": "Claude Code CLI nicht installiert — Subscription-Login nicht möglich",
  "onboarding.subscriptionLogin": "Führe 'claude login' in einem anderen Terminal aus.\n  Drücke Enter wenn du eingeloggt bist.",
  "onboarding.loginDone": "Login abgeschlossen?",
  "onboarding.loginChecking": "Login wird geprüft...",
  "onboarding.subscriptionActive": "Claude Code Subscription aktiv",
  "onboarding.loginNotRecognized": "Login nicht erkannt — prüfe mit 'claude --version'",
  "onboarding.loginCheckFailed": "Prüfung fehlgeschlagen",

  // security / image-sanitizer
  "security.imageSanitized": "Bild bereinigt: {format}, {originalSize} → {sanitizedSize} Bytes",
  "security.imageUnsupportedFormat": "Nicht unterstütztes Bildformat",
  "security.imageCorrupt": "Beschädigtes Bild — Verarbeitung fehlgeschlagen",
  "security.imageSizeExceeded": "Bild überschreitet maximale Größe ({maxSize} Bytes)",
  "security.imageProcessingFailed": "Bildverarbeitung fehlgeschlagen: {msg}",
  "security.imageSuspiciousMetadata": "Verdächtige Metadaten gefunden: {count} Treffer",
  "security.imageOrientationApplied": "EXIF-Orientierung angewendet",
  "security.imageMetadataStripped": "Metadaten entfernt ({fields})",

  // summary
  "onboarding.summaryTitle": "Konfiguration",
  "onboarding.summaryPlatform": "Plattform:",
  "onboarding.summaryBot": "Bot:",
  "onboarding.summaryOwnerId": "Owner-ID:",
  "onboarding.summaryPhoneId": "Phone-ID:",
  "onboarding.summaryOwner": "Owner:",
  "onboarding.summaryOllama": "Ollama:",
  "onboarding.summaryModel": "Modell:",
  "onboarding.summaryClaudeApiKey": "Claude Code:   API Key ({preview}...)",
  "onboarding.summaryClaudeSubscription": "Claude Code:   Subscription",
  "onboarding.summaryClaudeDisabled": "Claude Code:   Deaktiviert",
  "onboarding.savePrompt": "Konfiguration in .env speichern?",
  "onboarding.backupCreated": "Backup erstellt: {path}",
  "onboarding.envSaved": ".env wurde erstellt",
} satisfies Record<TranslationKey, string>;
