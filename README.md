# geofrey.ai

**Intelligent freight visibility platform for small and medium logistics companies.**

Track ocean vessels, air cargo, and parcels on a single live map — with real-time alerts via Telegram.

## What is this?

geofrey.ai connects to free and low-cost tracking APIs to give logistics teams a unified view of all their shipments. Paste a tracking number into Telegram, and geofrey auto-detects the type (container, vessel, flight, parcel) and starts tracking.

**Key features:**

- **Multi-modal tracking** — ocean (AIS), air (OpenSky), parcels (DHL) on one platform
- **Auto-detection** — container numbers, MMSIs, air waybills, flight callsigns, parcel numbers
- **Telegram bot** — `/track`, `/status`, `/list`, `/delete`, `/map`, `/help`
- **Live dashboard** — Leaflet map with real-time vessel/flight/parcel positions via SSE
- **Proactive alerts** — delay detection and status change notifications
- **Self-hosted** — runs on your server, your data stays with you

## Quick Start

### Prerequisites

- **Node.js 22+** ([download](https://nodejs.org/))
- **pnpm** (`npm install -g pnpm`)
- **Telegram bot** — create via [@BotFather](https://t.me/BotFather)

### Installation

```bash
git clone https://github.com/slavko-at-klincov-it/geofrey.ai.git
cd geofrey.ai
pnpm install
```

### Configuration

Create a `.env` file:

```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_OWNER_ID=your_telegram_user_id

# Optional: Tracking APIs
AISSTREAM_API_KEY=your_aisstream_key        # Ocean vessel tracking
OPENSKY_USER=your_opensky_username          # Air cargo tracking (higher rate limits)
OPENSKY_PASS=your_opensky_password
DHL_API_KEY=your_dhl_api_key                # Parcel tracking

# Optional: Dashboard
DASHBOARD_ENABLED=true                       # Default: true
DASHBOARD_PORT=3003                          # Default: 3003
DASHBOARD_TOKEN=your_secret_token           # Optional auth

# Optional: General
LOCALE=de                                   # de (default) or en
DATABASE_URL=./data/app.db                  # SQLite path
```

### Start

```bash
# Development (auto-reload)
pnpm dev

# Production
pnpm build
pnpm start
```

Send `/help` to your Telegram bot to get started.

## Tracking Sources

| Source | Protocol | Data | Free Tier |
|--------|----------|------|-----------|
| [AISStream](https://aisstream.io) | WebSocket | Vessel positions (MMSI) | Free API key |
| [OpenSky Network](https://opensky-network.org) | REST | Flight positions (ICAO24) | 400 req/day (4000 with account) |
| [DHL](https://developer.dhl.com) | REST | Parcel status + events | Free API key |

## Auto-Detection

Paste any tracking number and geofrey identifies it:

| Format | Example | Type |
|--------|---------|------|
| ISO 6346 container | `MSCU1234567` | Ocean |
| MMSI | `211234567` | Ocean |
| Air waybill | `020-12345678` | Air |
| Flight callsign | `LH400` | Air |
| ICAO24 hex | `3C6749` | Air |
| Parcel number | `00340434161094042557` | Parcel |

## Bot Commands

| Command | Description |
|---------|-------------|
| `/track <number>` | Start tracking a shipment |
| `/status [number]` | Show status (one or all) |
| `/list` | List all tracked shipments |
| `/delete <number>` | Stop tracking |
| `/map` | Link to dashboard map |
| `/help` | Available commands |

## Dashboard

The web dashboard shows all tracked shipments on a Leaflet map with OpenStreetMap tiles. Features:

- Real-time position updates via SSE
- Ship/plane/parcel markers with popups
- Collapsible sidebar with shipment list
- Dark theme
- Optional token authentication

Access at `http://localhost:3003` (default).

## Architecture

```
User (Telegram) → Bot Commands → Shipment Manager → DB (SQLite)
                                      ↕
                          Tracking APIs (AIS/OpenSky/DHL)
                                      ↓
                          Poller → Alert Handler → Telegram Notification
                                      ↓
                          Dashboard (Leaflet Map + SSE)
```

### Project Structure

```
src/
├── index.ts              # Entry point + graceful shutdown
├── config/               # Zod config schema + env var mapping
├── db/                   # SQLite + Drizzle ORM (3 tables)
├── shipments/            # Types + CRUD manager
├── tracking/             # AIS, OpenSky, DHL clients + auto-detector + poller
├── alerts/               # Delay + status change alerts
├── bot/                  # Telegram command handlers
├── dashboard/            # HTTP server + SSE + static files
└── i18n/                 # German + English translations
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `TELEGRAM_OWNER_ID` | Yes | — | Your Telegram user ID |
| `AISSTREAM_API_KEY` | No | — | AIS WebSocket API key |
| `OPENSKY_USER` | No | — | OpenSky username |
| `OPENSKY_PASS` | No | — | OpenSky password |
| `DHL_API_KEY` | No | — | DHL Tracking API key |
| `DASHBOARD_ENABLED` | No | `true` | Enable web dashboard |
| `DASHBOARD_PORT` | No | `3003` | Dashboard HTTP port |
| `DASHBOARD_TOKEN` | No | — | Dashboard auth token |
| `DATABASE_URL` | No | `./data/app.db` | SQLite database path |
| `LOCALE` | No | `de` | Language: `de` or `en` |

## Development

```bash
pnpm dev              # Dev mode with auto-reload
pnpm build            # TypeScript compile
pnpm lint             # Type check
pnpm db:generate      # Generate Drizzle migrations
```

## Contributing

Contributions welcome. Please:

1. Open an issue to discuss significant changes before submitting a PR
2. Follow existing code style (TypeScript strict, ESM, functional)
3. Use English for code/comments/commits

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2026 geofrey.ai contributors
