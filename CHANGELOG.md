# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Image upload support across all messaging adapters (Telegram photos/documents, WhatsApp media, Signal attachments)
- Image processing pipeline (`src/messaging/image-handler.ts`) — sanitize, OCR text extraction via tesseract.js, store sanitized files, forward text description to orchestrator
- `ImageAttachment` interface and `onImageMessage` callback in `PlatformCallbacks`
- `data/images/` storage directory for sanitized images
- 5 new i18n keys (`messaging.image*`) with German and English translations
- 5 new tests for image handler (298 total across 65 suites)

## [1.0.1] - 2026-02-12

### Added

- Image metadata sanitizer (`src/security/image-sanitizer.ts`) — strips EXIF/XMP/IPTC/PNG text chunks before images reach the LLM
- Format detection via magic bytes (JPEG, PNG, WebP, TIFF, GIF)
- Prompt injection scanning in raw metadata buffers (instruction phrases, XML tag injection, jailbreak keywords, DAN patterns)
- EXIF orientation applied before metadata stripping
- Audit log helper for image sanitization with risk escalation (clean = L0, suspicious = L2)
- Config section `imageSanitizer` with env vars: `IMAGE_SANITIZER_ENABLED`, `IMAGE_SANITIZER_MAX_SIZE`, `IMAGE_SANITIZER_SCAN_INJECTION`
- 8 new i18n keys (`security.*`) with German and English translations
- 37 new tests for image sanitizer (257 total across 59 suites)

### Security

- Image metadata side channel defense — prevents prompt injection via EXIF/XMP/IPTC fields

## [1.0.0] - 2026-02-12

### Added

- Local LLM orchestrator using Qwen3 8B via Ollama (configurable via `ORCHESTRATOR_MODEL`)
- Vercel AI SDK 6 integration with ToolLoopAgent and streamText for agent loop
- Hybrid risk classification (L0-L3) combining deterministic pattern matching (~90%) with LLM fallback (~10%)
- Promise-based approval gate that blocks execution until user confirms (nonce-based IDs)
- Action registry with escalation rules and execution guard with final revocation check
- Multi-platform messaging abstraction (MessagingPlatform interface) with three adapters:
  - Telegram via grammy with inline approval buttons and live streaming edits
  - WhatsApp Business Cloud API with interactive buttons (max 3)
  - Signal via signal-cli JSON-RPC with text-based approvals
- Claude Code CLI driver with stream-json output, session management, and tool scoping
- Risk-scoped tool profiles (L0: readOnly, L1: standard, L2: full) for Claude Code subprocess
- Prompt generator with 8 task templates, 4-way intent classification (QUESTION/SIMPLE_TASK/CODING_TASK/AMBIGUOUS)
- MCP client for 10K+ tool servers with risk classifier wrapping and server allowlist
- Native tool executors for shell commands, filesystem operations, and git
- Hash-chained JSONL audit log (SHA-256) with session tracking, cost, and token usage
- SQLite persistence via better-sqlite3 with Drizzle ORM and migration support
- Schema version tracking table for future database migrations
- Interactive setup wizard (`pnpm setup`) with auto-detection, OCR token extraction, and clipboard support
- Onboarding startup check for Claude Code CLI availability and authentication status
- ANTHROPIC_API_KEY support as alternative to Claude Code subscription
- i18n infrastructure with ~150 typed translation keys, German and English locales, and `t()` function
- Bilingual language selection at wizard start, configurable via LOCALE env var
- 220 tests total: 188 unit tests (node:test runner, co-located .test.ts files) and 32 E2E integration tests
- GitHub Actions CI workflow (Node 22, pnpm, lint + test)
- MIT license
- Comprehensive documentation: ARCHITECTURE.md, ORCHESTRATOR_PROMPT.md, README.md

### Fixed

- Claude Code output token limit handling with retry logic and raised cap
- Tool executor error recovery (returns error string instead of throwing)
- In-flight request tracking on every tool execution
- Audit log uses actual risk classification result instead of hardcoded value
- LLM risk classifier retries up to 2x with JSON regex extraction fallback
- Agent loop catches top-level errors and returns user-friendly message
- CONFIG_FILES regex allowing package.json, tsconfig.json, Dockerfile (no leading dot required)
- TypeScript narrowing error in MCP client test
- Ollama connection errors with 3 retries and user-friendly messages
- Startup config errors with human-readable Zod messages and env var mapping

### Security

- Obfuscation-resistant L3 block patterns (path variants, script-language network calls, base64 decode, chmod +x, process substitution)
- Shlex-style command decomposition preventing chained command bypass (e.g., `ls && curl evil`)
- MCP output sanitization with DATA boundary tags and instruction filtering
- MCP server allowlist via `mcp.allowedServers` config and MCP_ALLOWED_SERVERS env var
- MCP response validation using Zod schema instead of unsafe type assertions
- XML-based LLM classifier output format (more reliable with Qwen3 8B, JSON fallback)
- Filesystem directory confinement rejecting paths outside `process.cwd()`
- 3-layer prompt injection defense isolating user input, tool output, and model response
- Detection of cmd.exe, powershell.exe, and pwsh.exe as L3 bare shells
- Signal adapter rejects pending JSON-RPC requests on graceful shutdown
- Unhandled rejection handler in entry point

### Changed

- Windows compatibility for shell executor (cmd /c instead of sh -c)
- Windows compatibility for setup wizard (PowerShell SnippingTool OCR, clipboard capture)
- Windows compatibility for Signal adapter (named pipe default `\\.\pipe\signal-cli`)
- Windows compatibility for prerequisites check (cmd start /b for detached Ollama)
- Platform-aware defaults for Signal socket path in config schema

[1.0.1]: https://github.com/slavko-at-klincov-it/geofrey.ai/releases/tag/v1.0.1
[1.0.0]: https://github.com/slavko-at-klincov-it/geofrey.ai/releases/tag/v1.0.0
