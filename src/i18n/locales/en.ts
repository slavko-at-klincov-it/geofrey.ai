import type { TranslationKey } from "../keys.js";

export const en: Record<TranslationKey, string> = {
  // app
  "app.claudeUnavailable": "Claude Code unavailable — Ollama tools still work.",
  "app.ollamaRetrying": "Ollama not reachable — attempt {attempt}/3...",
  "app.ollamaNotReachable": "Ollama not reachable after {attempts} attempts — start with 'ollama serve'",
  "app.ollamaConnectionError": "Ollama not reachable — start with 'ollama serve'",

  // approval / risk-classifier
  "approval.blockedCommand": "Blocked command",
  "approval.blockedCommandPath": "Blocked command (path variant)",
  "approval.scriptNetwork": "Network access via scripting language",
  "approval.base64Decode": "Base64 decode detected — possible payload",
  "approval.chmodExec": "Making executable — download-and-run pattern",
  "approval.procSubstitution": "Process substitution detected",
  "approval.injectionPattern": "Injection pattern detected",
  "approval.forcePush": "Force-push overwrites remote irreversibly",
  "approval.bareShell": "Shell interpreter as pipe target",
  "approval.sensitivePath": "Access to sensitive file",
  "approval.configFile": "Config file — approval required",
  "approval.readOnly": "Read-only, no modification",
  "approval.llmFallback": "LLM classification failed — fallback L2",
  "approval.noReason": "No reason provided",
  "approval.classifierLanguage": "English",

  // tools
  "tools.l3Blocked": "L3: Action blocked — {reason}",
  "tools.executionFailed": "ERROR: {name} failed — {msg}",

  // orchestrator
  "orchestrator.respondInstruction": "Respond to the user in {language}. Code, commands, and technical identifiers stay in English.",
  "orchestrator.language": "English",
  "orchestrator.ambiguousExample": "I assume you want to...",
  "orchestrator.noResponse": "No response.",
  "orchestrator.errorPrefix": "Agent loop error: {msg}",
  "orchestrator.errorShort": "Error: {msg}",
  "orchestrator.tooManyErrors": "Too many consecutive errors ({count}). Please check your configuration or try again.",

  // messaging
  "messaging.claudeWorking": "Claude Code is working...",
  "messaging.noOutput": "(no output)",
  "messaging.approvalRequired": "Approval required",
  "messaging.actionLabel": "Action:",
  "messaging.riskLabel": "Risk:",
  "messaging.detailsLabel": "Details:",
  "messaging.approve": "Approve",
  "messaging.deny": "Deny",
  "messaging.approved": "Approved",
  "messaging.denied": "Denied",
  "messaging.processingError": "Processing error. Please try again.",
  "messaging.signalInstruction": "Reply with: 1 = Approve, 2 = Deny",

  // messaging - image
  "messaging.imageProcessing": "Processing image...",
  "messaging.imageDownloadFailed": "Failed to download image. Please try again.",
  "messaging.imageUnsupported": "Unsupported image format. Supported: JPEG, PNG, WebP, TIFF, GIF.",
  "messaging.imageTooLarge": "Image too large (max {maxSize}).",
  "messaging.imageOcrFailed": "OCR failed — image forwarded without text extraction.",

  // check
  "check.disabled": "Claude Code: Disabled (CLAUDE_CODE_ENABLED=false)",
  "check.notFound": "Claude Code: ERROR — 'claude' not found",
  "check.notFoundInstall": "  → Install: npm install -g @anthropic-ai/claude-code",
  "check.notFoundDocs": "  → Docs: https://docs.anthropic.com/en/docs/claude-code",
  "check.noAuth": "Claude Code: ERROR — No authentication",
  "check.authOptionA": "  → Option A: Claude Pro/Max/Teams/Enterprise Subscription → 'claude login'",
  "check.authOptionB": "  → Option B: API Key → set ANTHROPIC_API_KEY in .env",
  "check.authCreateKey": "  → Create API Key: https://console.anthropic.com/settings/keys",
  "check.okApiKey": "Claude Code: OK (API Key, {model})",
  "check.okSubscription": "Claude Code: OK (Subscription, {model})",

  // onboarding ui
  "onboarding.banner": "geofrey.ai Setup Wizard",
  "onboarding.stepLabel": "Step {num}: {title}",

  // onboarding setup
  "onboarding.envCreated": ".env has been created",
  "onboarding.startNow": "Start geofrey.ai now?",
  "onboarding.starting": "Starting geofrey.ai...",
  "onboarding.startLater": "Start later with: pnpm dev",
  "onboarding.indexHint": "Tip: Run 'pnpm index' to build the project index for better prompts.",
  "onboarding.setupAborted": "Setup aborted.",
  "onboarding.error": "Error:",

  // onboarding wizard
  "onboarding.nodeRequired": "Node.js 22+ is required. Setup aborted.",
  "onboarding.telegramAborted": "Telegram setup aborted.",
  "onboarding.whatsappAborted": "WhatsApp setup aborted.",
  "onboarding.signalAborted": "Signal setup aborted.",
  "onboarding.configNotSaved": "Configuration was not saved.",

  // prerequisites
  "onboarding.prereqTitle": "Prerequisites",
  "onboarding.nodeVersionFail": "Node.js {version} — version 22+ required",
  "onboarding.pnpmNotFound": "pnpm not found",
  "onboarding.ollamaRunning": "Ollama running ({url})",
  "onboarding.ollamaNotReachable": "Ollama not reachable",
  "onboarding.ollamaStart": "Start Ollama? (ollama serve)",
  "onboarding.ollamaStarting": "Starting Ollama...",
  "onboarding.ollamaStarted": "Ollama running",
  "onboarding.ollamaStartFailed": "Could not start Ollama",
  "onboarding.ollamaStartManual": "Start manually: ollama serve",
  "onboarding.ollamaStartError": "Error starting Ollama",
  "onboarding.ollamaInstallHint": "Install: https://ollama.com",
  "onboarding.modelLoaded": "{model} loaded",
  "onboarding.modelNotLoaded": "Model '{model}' not loaded",
  "onboarding.modelDownload": "Download model? (~5 GB)",
  "onboarding.modelDownloading": "Downloading {model}...",
  "onboarding.modelDownloadFailed": "Error downloading {model}",
  "onboarding.claudeCliFound": "Claude Code CLI {version}",
  "onboarding.claudeCliNotFound": "Claude Code CLI not found",
  "onboarding.claudeCliInstall": "Install Claude Code?",
  "onboarding.claudeCliInstalling": "Installing Claude Code...",
  "onboarding.claudeCliInstalled": "Claude Code installed",
  "onboarding.claudeCliInstallFailed": "Installation failed",

  // platform
  "onboarding.platformTitle": "Messaging Platform",
  "onboarding.platformPrompt": "Which platform do you want to use?",
  "onboarding.platformTelegram": "Telegram (recommended)",
  "onboarding.platformWhatsApp": "WhatsApp Business",
  "onboarding.platformSignal": "Signal",

  // telegram setup
  "onboarding.telegramTitle": "Set up Telegram",
  "onboarding.telegramHasBot": "Do you already have a Telegram bot?",
  "onboarding.telegramHasBotYes": "Yes, I have a token",
  "onboarding.telegramHasBotNo": "No, I need instructions",
  "onboarding.telegramCreateGuide": `
  How to create a Telegram bot:
  1. Open Telegram and search for @BotFather
  2. Send /newbot
  3. Choose a name (e.g. "Geofrey AI")
  4. Choose a username (e.g. "my_geofrey_bot")
  5. BotFather will give you a token — copy it
`,
  "onboarding.tokenInputMethod": "How do you want to enter the bot token?",
  "onboarding.tokenDirect": "Type/paste directly",
  "onboarding.tokenClipboard": "Read from clipboard",
  "onboarding.tokenOcr": "Extract from screenshot (OCR)",
  "onboarding.tokenPrompt": "Bot token:",
  "onboarding.clipboardReading": "Reading clipboard...",
  "onboarding.clipboardFound": "Token found in clipboard",
  "onboarding.clipboardNotFound": "No token found in clipboard",
  "onboarding.tokenUseConfirm": "Use this token? ({preview}...)",
  "onboarding.ocrHint": "Take a screenshot of the bot token...",
  "onboarding.screenshotFailed": "Could not take screenshot",
  "onboarding.ocrExtracting": "Extracting token from screenshot...",
  "onboarding.ocrExtracted": "Token extracted",
  "onboarding.ocrNotFound": "No token found in screenshot",
  "onboarding.retryPrompt": "Try again?",
  "onboarding.tokenInvalid": "Invalid token format (expected: 12345678:ABCD...)",
  "onboarding.tokenValidating": "Validating token...",
  "onboarding.tokenBotFound": "Bot found: @{username} ({name})",
  "onboarding.tokenRejected": "Token invalid — rejected by Telegram",
  "onboarding.autoDetectId": "Auto-detect Telegram user ID?",
  "onboarding.autoDetectSend": "Starting the bot briefly — send it a message in Telegram.",
  "onboarding.autoDetectOpen": "→ Open: https://t.me/{username}",
  "onboarding.autoDetectWaiting": "Waiting for message to @{username}...",
  "onboarding.autoDetectReceived": "Message received from: {name}",
  "onboarding.autoDetectReply": "Your ID ({id}) has been detected!",
  "onboarding.autoDetectBotFail": "Could not start bot",
  "onboarding.idConfirm": "Your Telegram ID: {id} — correct?",
  "onboarding.idManualHint": "Alternatively: Send /start to @userinfobot to find your ID",
  "onboarding.idManualPrompt": "Telegram user ID:",
  "onboarding.idInvalid": "Invalid user ID",

  // whatsapp setup
  "onboarding.whatsappTitle": "Set up WhatsApp Business",
  "onboarding.whatsappPrereqs": `
  Prerequisites:
  1. Meta Business Account + App created
  2. WhatsApp Business API activated
  3. Permanent Access Token generated
  → Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
`,
  "onboarding.phoneNumberId": "Phone Number ID:",
  "onboarding.phoneNumberIdMissing": "Phone Number ID missing",
  "onboarding.accessTokenPrompt": "Access Token:",
  "onboarding.accessTokenMissing": "Access Token missing",
  "onboarding.connectionCheck": "Checking connection...",
  "onboarding.whatsappConnected": "WhatsApp Business API connected",
  "onboarding.whatsappConnectionFailed": "API connection failed — check Phone Number ID and Access Token",
  "onboarding.networkError": "Network error during validation",
  "onboarding.continueAnyway": "Continue anyway?",
  "onboarding.verifyTokenPrompt": "Webhook Verify Token (your choice):",
  "onboarding.ownerPhonePrompt": "Your phone number (with country code, e.g. 491234567890):",
  "onboarding.phoneMissing": "Phone number missing",
  "onboarding.webhookPortPrompt": "Webhook Port:",
  "onboarding.whatsappPrivacyHint": "IMPORTANT: Enable 'Advanced Chat Privacy' in WhatsApp",
  "onboarding.whatsappPrivacyPath": "→ Settings > Privacy > Advanced Chat Privacy",

  // signal setup
  "onboarding.signalTitle": "Set up Signal",
  "onboarding.signalPrereqs": `
  Prerequisites:
  1. signal-cli installed and registered
  2. signal-cli started in JSON-RPC mode
  → Docs: https://github.com/AsamK/signal-cli
`,
  "onboarding.signalSocketFound": "signal-cli socket found: {path}",
  "onboarding.signalSocketNotFound": "Default socket not found: {path}",
  "onboarding.signalSocketPrompt": "Path to signal-cli socket:",
  "onboarding.signalConnected": "signal-cli connected",
  "onboarding.signalConnectionFailed": "Connection failed",
  "onboarding.signalOwnerPhone": "Your phone number (e.g. +491234567890):",
  "onboarding.signalBotPhone": "Bot phone number (registered with signal-cli):",
  "onboarding.signalBotPhoneMissing": "Bot number missing",

  // claude auth
  "onboarding.claudeTitle": "Claude Code",
  "onboarding.claudeAuthPrompt": "Claude Code authentication:",
  "onboarding.claudeAuthApiKey": "API Key (ANTHROPIC_API_KEY)",
  "onboarding.claudeAuthSubscription": "Subscription (claude login)",
  "onboarding.claudeAuthSkip": "Skip",
  "onboarding.apiKeyInputMethod": "How do you want to enter the API key?",
  "onboarding.apiKeyDirect": "Type/paste directly",
  "onboarding.apiKeyClipboard": "Read from clipboard",
  "onboarding.apiKeyOcr": "Extract from screenshot (OCR)",
  "onboarding.apiKeyPrompt": "API Key:",
  "onboarding.apiKeyClipboardFound": "API Key found in clipboard",
  "onboarding.apiKeyClipboardNotFound": "No API Key found in clipboard",
  "onboarding.apiKeyUseConfirm": "Use this key? ({preview}...)",
  "onboarding.apiKeyOcrHint": "Take a screenshot of the API key...",
  "onboarding.apiKeyOcrExtracting": "Extracting API Key from screenshot...",
  "onboarding.apiKeyOcrExtracted": "API Key extracted",
  "onboarding.apiKeyOcrNotFound": "No API Key found in screenshot",
  "onboarding.apiKeyInvalid": "Invalid key format (expected: sk-ant-...)",
  "onboarding.apiKeyValidating": "Validating API Key...",
  "onboarding.apiKeyValid": "API Key valid",
  "onboarding.apiKeyRejected": "API Key invalid — rejected by Anthropic",
  "onboarding.claudeCliMissing": "Claude Code CLI not installed — subscription login not possible",
  "onboarding.subscriptionLogin": "Run 'claude login' in another terminal.\n  Press Enter when logged in.",
  "onboarding.loginDone": "Login complete?",
  "onboarding.loginChecking": "Checking login...",
  "onboarding.subscriptionActive": "Claude Code subscription active",
  "onboarding.loginNotRecognized": "Login not recognized — check with 'claude --version'",
  "onboarding.loginCheckFailed": "Check failed",

  // cron / scheduler
  "cron.created": "Job created: {id}",
  "cron.deleted": "Job deleted: {id}",
  "cron.notFound": "Job not found: {id}",
  "cron.listEmpty": "No scheduled jobs",
  "cron.listHeader": "{count} scheduled jobs:",
  "cron.jobFailed": "Job {id} failed (attempt {attempt}/{max}): {error}",
  "cron.jobDisabled": "Job {id} disabled after {max} failed attempts",
  "cron.schedulerStarted": "Scheduler started with {count} jobs",

  // memory
  "memory.saved": "Memory saved",
  "memory.empty": "No memories found",
  "memory.searchResults": "{count} relevant memories found",
  "memory.indexing": "Indexing memories...",
  "memory.indexed": "{count} chunks indexed",

  // search / web
  "search.noResults": "No search results",
  "search.fetchFailed": "Failed to fetch page: {url}",
  "search.providerError": "Search provider error: {msg}",

  // security / image-sanitizer
  "security.imageSanitized": "Image sanitized: {format}, {originalSize} → {sanitizedSize} bytes",
  "security.imageUnsupportedFormat": "Unsupported image format",
  "security.imageCorrupt": "Corrupt image — processing failed",
  "security.imageSizeExceeded": "Image exceeds maximum size ({maxSize} bytes)",
  "security.imageProcessingFailed": "Image processing failed: {msg}",
  "security.imageSuspiciousMetadata": "Suspicious metadata found: {count} matches",
  "security.imageOrientationApplied": "EXIF orientation applied",
  "security.imageMetadataStripped": "Metadata stripped ({fields})",

  // billing
  "billing.budgetWarning": "Budget warning: {pct}% reached (${spent} of ${limit} today)",
  "billing.budgetExceeded": "Daily budget exceeded! Cost: ${spent}, Limit: ${limit}",
  "billing.usageLogged": "Usage: {model} — {tokens} tokens, ${cost}",

  // dashboard
  "dashboard.started": "Dashboard started on port {port}",
  "dashboard.unauthorized": "Unauthorized",
  "dashboard.connected": "WebChat connected",
  "dashboard.disconnected": "WebChat disconnected",

  // summary
  "onboarding.summaryTitle": "Configuration",
  "onboarding.summaryPlatform": "Platform:",
  "onboarding.summaryBot": "Bot:",
  "onboarding.summaryOwnerId": "Owner ID:",
  "onboarding.summaryPhoneId": "Phone ID:",
  "onboarding.summaryOwner": "Owner:",
  "onboarding.summaryOllama": "Ollama:",
  "onboarding.summaryModel": "Model:",
  "onboarding.summaryClaudeApiKey": "Claude Code:   API Key ({preview}...)",
  "onboarding.summaryClaudeSubscription": "Claude Code:   Subscription",
  "onboarding.summaryClaudeDisabled": "Claude Code:   Disabled",
  "onboarding.savePrompt": "Save configuration to .env?",
  "onboarding.backupCreated": "Backup created: {path}",
  "onboarding.envSaved": ".env has been created",

  // slack
  "onboarding.slackTitle": "Set up Slack",
  "onboarding.slackPrereqs": "\n  Prerequisites:\n  1. Slack App created (api.slack.com/apps)\n  2. Socket Mode enabled\n  3. Bot Token Scopes: chat:write, channels:history, channels:read\n  → Docs: https://api.slack.com/start\n",
  "onboarding.slackBotToken": "Bot Token (xoxb-...):",
  "onboarding.slackAppToken": "App-Level Token (xapp-...):",
  "onboarding.slackChannelId": "Channel ID:",
  "onboarding.slackAborted": "Slack setup aborted.",
  "onboarding.platformSlack": "Slack",

  // discord
  "onboarding.discordTitle": "Set up Discord",
  "onboarding.discordPrereqs": "\n  Prerequisites:\n  1. Discord Application created (discord.com/developers)\n  2. Bot created and token copied\n  3. Bot invited to server with: Send Messages, Read Message History\n  → Docs: https://discord.com/developers/docs\n",
  "onboarding.discordBotToken": "Bot Token:",
  "onboarding.discordChannelId": "Channel ID:",
  "onboarding.discordAborted": "Discord setup aborted.",
  "onboarding.platformDiscord": "Discord",

  // voice
  "voice.transcribing": "Transcribing voice message...",
  "voice.transcribed": "[Voice message]: {text}",
  "voice.downloadFailed": "Failed to download voice message.",
  "voice.transcriptionFailed": "Transcription failed: {msg}",
  "voice.ffmpegMissing": "ffmpeg not found — required for voice messages",
  "voice.noProvider": "No STT provider configured (STT_PROVIDER + OPENAI_API_KEY or WHISPER_MODEL_PATH)",

  // skills
  "skills.listed": "{count} skills found",
  "skills.installed": "Skill installed: {name}",
  "skills.enabled": "Skill enabled: {name}",
  "skills.disabled": "Skill disabled: {name}",
  "skills.generated": "Skill created: {name} ({path})",
  "skills.notFound": "Skill not found: {id}",
  "skills.noSkills": "No skills found",
  "skills.invalidFormat": "Invalid SKILL.md format: {msg}",
  "skills.permissionDenied": "Skill permission denied: {permission}",

  // browser
  "browser.launched": "Browser launched on port {port}",
  "browser.connected": "Browser connected on port {port}",
  "browser.closed": "Browser closed",
  "browser.closedAll": "All browsers closed",
  "browser.navigated": "Navigated to {url}",
  "browser.notRunning": "No browser active — launch one first",
  "browser.launchFailed": "Browser launch failed: {msg}",
  "browser.actionFailed": "Browser action failed: {msg}",

  // compaction
  "compaction.started": "Compacting conversation...",
  "compaction.done": "Compacted: {original} → {compacted} messages",
  "compaction.failed": "Compaction failed: {msg}",
  "compaction.notNeeded": "Compaction not needed (context window below 75%)",
  "compaction.memoryFlushed": "Key facts saved to long-term memory",
} satisfies Record<TranslationKey, string>;
