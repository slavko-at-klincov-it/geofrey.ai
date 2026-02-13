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

  // tools - common
  "tools.l3Blocked": "L3: Aktion blockiert — {reason}",
  "tools.executionFailed": "ERROR: {name} fehlgeschlagen — {msg}",
  "tools.paramRequired": "Fehler: '{param}' ist erforderlich für {action}",
  "tools.unknownAction": "Unbekannte Aktion: {action}",
  "tools.fetchFailed": "Fehler: {url} konnte nicht geladen werden ({status})",
  "tools.fileWritten": "Geschrieben: {path}",
  "tools.fileDeleted": "Gelöscht: {path}",
  "tools.gitError": "git-Fehler ({exitCode}): {stderr}",
  "tools.searchNoMatches": "Keine Treffer für \"{pattern}\"",
  "tools.searchResults": "{count} Treffer (max {max}):",
  "tools.projectMapNotFound": "Projekt-Map nicht gefunden. Erstelle sie mit `pnpm index`.",
  "tools.noMatchingFiles": "Keine passenden Dateien gefunden.",
  "tools.projectMapResults": "{count} Dateien (indexiert {date})",
  "tools.pathOutsideProject": "Pfad außerhalb des Projektverzeichnisses: {path}",
  "tools.dirOutsideProject": "Verzeichnis \"{dir}\" liegt außerhalb des Projektstamms",
  "tools.notInitialized": "Fehler: {name} nicht initialisiert",

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

  // cron / scheduler
  "cron.created": "Job erstellt: {id}",
  "cron.deleted": "Job gelöscht: {id}",
  "cron.notFound": "Job nicht gefunden: {id}",
  "cron.listEmpty": "Keine geplanten Jobs",
  "cron.listHeader": "{count} geplante Jobs:",
  "cron.jobFailed": "Job {id} fehlgeschlagen (Versuch {attempt}/{max}): {error}",
  "cron.jobDisabled": "Job {id} deaktiviert nach {max} fehlgeschlagenen Versuchen",
  "cron.schedulerStarted": "Scheduler gestartet mit {count} Jobs",
  "cron.createFailed": "Fehler beim Erstellen des Jobs: {msg}",

  // memory
  "memory.saved": "Erinnerung gespeichert",
  "memory.empty": "Keine Erinnerungen gefunden",
  "memory.searchResults": "{count} relevante Erinnerungen gefunden",
  "memory.indexing": "Erinnerungen werden indexiert...",
  "memory.indexed": "{count} Chunks indexiert",

  // search / web
  "search.noResults": "Keine Suchergebnisse",
  "search.fetchFailed": "Seite konnte nicht geladen werden: {url}",
  "search.providerError": "Suchanbieter-Fehler: {msg}",

  // security / image-sanitizer
  "security.imageSanitized": "Bild bereinigt: {format}, {originalSize} → {sanitizedSize} Bytes",
  "security.imageUnsupportedFormat": "Nicht unterstütztes Bildformat",
  "security.imageCorrupt": "Beschädigtes Bild — Verarbeitung fehlgeschlagen",
  "security.imageSizeExceeded": "Bild überschreitet maximale Größe ({maxSize} Bytes)",
  "security.imageProcessingFailed": "Bildverarbeitung fehlgeschlagen: {msg}",
  "security.imageSuspiciousMetadata": "Verdächtige Metadaten gefunden: {count} Treffer",
  "security.imageOrientationApplied": "EXIF-Orientierung angewendet",
  "security.imageMetadataStripped": "Metadaten entfernt ({fields})",

  // billing
  "billing.budgetWarning": "Budget-Warnung: {pct}% erreicht (${spent} von ${limit} heute)",
  "billing.budgetExceeded": "Tagesbudget überschritten! Kosten: ${spent}, Limit: ${limit}",
  "billing.usageLogged": "Nutzung: {model} — {tokens} Tokens, ${cost}",

  // dashboard
  "dashboard.started": "Dashboard gestartet auf Port {port}",
  "dashboard.unauthorized": "Nicht autorisiert",
  "dashboard.connected": "WebChat verbunden",
  "dashboard.disconnected": "WebChat getrennt",

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

  // slack
  "onboarding.slackTitle": "Slack einrichten",
  "onboarding.slackPrereqs": "\n  Voraussetzungen:\n  1. Slack App erstellt (api.slack.com/apps)\n  2. Socket Mode aktiviert\n  3. Bot Token Scopes: chat:write, channels:history, channels:read\n  → Docs: https://api.slack.com/start\n",
  "onboarding.slackBotToken": "Bot Token (xoxb-...):",
  "onboarding.slackAppToken": "App-Level Token (xapp-...):",
  "onboarding.slackChannelId": "Channel-ID:",
  "onboarding.slackAborted": "Slack-Setup abgebrochen.",
  "onboarding.platformSlack": "Slack",

  // discord
  "onboarding.discordTitle": "Discord einrichten",
  "onboarding.discordPrereqs": "\n  Voraussetzungen:\n  1. Discord Application erstellt (discord.com/developers)\n  2. Bot erstellt und Token kopiert\n  3. Bot zum Server eingeladen mit: Send Messages, Read Message History\n  → Docs: https://discord.com/developers/docs\n",
  "onboarding.discordBotToken": "Bot Token:",
  "onboarding.discordChannelId": "Channel-ID:",
  "onboarding.discordAborted": "Discord-Setup abgebrochen.",
  "onboarding.platformDiscord": "Discord",

  // voice
  "voice.transcribing": "Sprachnachricht wird transkribiert...",
  "voice.transcribed": "[Sprachnachricht]: {text}",
  "voice.downloadFailed": "Sprachnachricht konnte nicht heruntergeladen werden.",
  "voice.transcriptionFailed": "Transkription fehlgeschlagen: {msg}",
  "voice.ffmpegMissing": "ffmpeg nicht gefunden — für Sprachnachrichten erforderlich",
  "voice.noProvider": "Kein STT-Provider konfiguriert (STT_PROVIDER + OPENAI_API_KEY oder WHISPER_MODEL_PATH)",

  // skills
  "skills.listed": "{count} Skills gefunden",
  "skills.installed": "Skill installiert: {name}",
  "skills.enabled": "Skill aktiviert: {name}",
  "skills.disabled": "Skill deaktiviert: {name}",
  "skills.generated": "Skill erstellt: {name} ({path})",
  "skills.notFound": "Skill nicht gefunden: {id}",
  "skills.noSkills": "Keine Skills gefunden",
  "skills.invalidFormat": "Ungültiges SKILL.md Format: {msg}",
  "skills.permissionDenied": "Skill-Berechtigung verweigert: {permission}",

  // browser
  "browser.launched": "Browser gestartet auf Port {port}",
  "browser.connected": "Browser verbunden auf Port {port}",
  "browser.closed": "Browser geschlossen",
  "browser.closedAll": "Alle Browser geschlossen",
  "browser.navigated": "Navigiert zu {url}",
  "browser.notRunning": "Kein Browser aktiv — starte zuerst mit 'launch'",
  "browser.launchFailed": "Browser konnte nicht gestartet werden: {msg}",
  "browser.actionFailed": "Browser-Aktion fehlgeschlagen: {msg}",
  "browser.clicked": "Node {nodeId} geklickt",
  "browser.filled": "Node {nodeId} mit Text gefüllt",
  "browser.screenshotCaptured": "Screenshot aufgenommen ({size} Bytes)",
  "browser.selectorFound": "Selector \"{selector}\" gefunden",

  // compaction
  "compaction.started": "Konversation wird kompaktiert...",
  "compaction.done": "Kompaktiert: {original} → {compacted} Nachrichten",
  "compaction.failed": "Kompaktierung fehlgeschlagen: {msg}",
  "compaction.notNeeded": "Kompaktierung nicht nötig (Context-Window unter 75%)",
  "compaction.memoryFlushed": "Wichtige Fakten im Langzeitgedächtnis gespeichert",

  // process manager
  "process.spawned": "Prozess gestartet: [{pid}] {name}",
  "process.killed": "Prozess beendet: [{pid}] {name}",
  "process.killedForced": "Prozess erzwungen beendet (SIGKILL): [{pid}] {name}",
  "process.notFound": "Prozess nicht gefunden: {pid}",
  "process.listEmpty": "Keine aktiven Prozesse",
  "process.listHeader": "{count} aktive Prozesse:",
  "process.noLogs": "Keine Logs für Prozess {pid}",
  "process.spawnFailed": "Fehler beim Starten des Prozesses: {msg}",

  // sandbox
  "sandbox.created": "Sandbox erstellt: {id}",
  "sandbox.destroyed": "Sandbox zerstört: {id}",
  "sandbox.execError": "Sandbox-Ausführung fehlgeschlagen: {msg}",
  "sandbox.dockerNotFound": "Docker nicht gefunden — für Sandbox erforderlich",

  // webhook
  "webhook.serverStarted": "Webhook-Server gestartet auf Port {port}",
  "webhook.fired": "Webhook ausgelöst: {name} → Chat {chatId}",
  "webhook.created": "Webhook erstellt: {id}",
  "webhook.listEmpty": "Keine Webhooks registriert",
  "webhook.listHeader": "{count} Webhooks:",
  "webhook.notFound": "Webhook nicht gefunden",
  "webhook.deleted": "Webhook gelöscht: {id}",
  "webhook.testResult": "Testergebnis: {status} — {message}",

  // agents
  "agents.hubStarted": "Agent-Hub gestartet ({strategy})",
  "agents.routed": "Nachricht an Agent '{agent}' weitergeleitet",
  "agents.notFound": "Agent nicht gefunden: {id}",
  "agents.created": "Agent erstellt: {name}",
  "agents.deleted": "Agent gelöscht: {id}",
  "agents.listEmpty": "Keine Agenten konfiguriert",
  "agents.listHeader": "{count} Agenten:",
  "agents.templates": "Verfügbare Vorlagen: {list}",
  "agents.notFoundDetailed": "Fehler: Agent \"{id}\" nicht gefunden. Verfügbar: {available}",
  "agents.agentDisabled": "Fehler: Agent \"{id}\" ist deaktiviert",

  // marketplace
  "marketplace.listed": "{count} Skills im Marketplace",
  "marketplace.installed": "Skill installiert: {name}",
  "marketplace.hashMismatch": "Hash-Prüfung fehlgeschlagen für {name} — Datei manipuliert?",
  "marketplace.fetchFailed": "Marketplace nicht erreichbar: {msg}",
  "marketplace.templateCreated": "Skill aus Template erstellt: {name}",

  // tts
  "tts.speaking": "Sprachausgabe wird generiert...",
  "tts.spoken": "Audio generiert ({length} Bytes)",
  "tts.notConfigured": "TTS nicht konfiguriert — setze TTS_ENABLED=true und ELEVENLABS_API_KEY",
  "tts.voicesList": "{count} Stimmen verfügbar:",
  "tts.synthesizeFailed": "Sprachsynthese fehlgeschlagen: {msg}",

  // companion
  "companion.paired": "Gerät gekoppelt: {name}",
  "companion.unpaired": "Gerät entkoppelt: {id}",
  "companion.listEmpty": "Keine gekoppelten Geräte",
  "companion.listHeader": "{count} gekoppelte Geräte:",
  "companion.pairingCode": "Kopplungscode: {code} (gültig {ttl}s)",
  "companion.notFound": "Gerät nicht gefunden: {id}",
  "companion.pushSent": "Push-Benachrichtigung gesendet an {name}",
  "companion.notConfigured": "Companion nicht konfiguriert — setze COMPANION_ENABLED=true",

  // smart home
  "smartHome.discovered": "{count} Geräte entdeckt:",
  "smartHome.listEmpty": "Keine Smart-Home-Geräte gefunden",
  "smartHome.listHeader": "{count} Geräte:",
  "smartHome.controlled": "Gerät gesteuert: {device}",
  "smartHome.sceneFired": "Szene aktiviert: {scene}",
  "smartHome.notConfigured": "Smart Home nicht konfiguriert — setze SMART_HOME_ENABLED=true",
  "smartHome.providerRequired": "Provider erforderlich (hue, homeassistant, sonos)",

  // gmail
  "gmail.authUrl": "Google-Anmeldung: {url}",
  "gmail.authenticated": "Google-Konto verbunden",
  "gmail.listEmpty": "Keine E-Mails gefunden",
  "gmail.listHeader": "{count} E-Mails:",
  "gmail.sent": "E-Mail gesendet an {to}",
  "gmail.labeled": "Label aktualisiert: {id}",
  "gmail.deleted": "E-Mail gelöscht: {id}",
  "gmail.notConfigured": "Gmail nicht konfiguriert — setze GOOGLE_ENABLED=true und GOOGLE_CLIENT_ID",

  // calendar
  "calendar.authUrl": "Google-Anmeldung: {url}",
  "calendar.listEmpty": "Keine Termine gefunden",
  "calendar.listHeader": "{count} Termine:",
  "calendar.created": "Termin erstellt: {summary}",
  "calendar.updated": "Termin aktualisiert: {id}",
  "calendar.deleted": "Termin gelöscht: {id}",
  "calendar.notConfigured": "Kalender nicht konfiguriert — setze GOOGLE_ENABLED=true und GOOGLE_CLIENT_ID",
} satisfies Record<TranslationKey, string>;
