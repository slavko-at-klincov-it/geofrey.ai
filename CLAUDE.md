# geofrey.ai

## Overview
Affordable freight visibility platform for small/medium logistics companies. Track ocean vessels, air cargo, and parcels on a single dashboard with real-time alerts via Telegram.

## Core Concept
1. **Multi-modal tracking** — ocean (AIS WebSocket), air (OpenSky REST), parcel (DHL REST)
2. **Auto-detection** — paste any tracking number and geofrey detects the type (container, MMSI, AWB, flight, parcel)
3. **Telegram bot** — `/track`, `/status`, `/list`, `/delete`, `/map`, `/help`
4. **Live dashboard** — Leaflet map with SSE updates, dark theme, collapsible sidebar
5. **Proactive alerts** — delay detection, status change notifications via Telegram

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Language | **TypeScript** (Node.js ≥22) |
| Messaging | **grammY** (Telegram) |
| State/DB | **SQLite** (better-sqlite3 + **Drizzle ORM**) |
| WebSocket | **ws** (AIS stream) |
| Validation | **Zod** |
| Package Manager | **pnpm** |
| i18n | Typed key-value maps (`src/i18n/`) — `t()` function, `de` + `en` locales |
| Code language | English |
| Communication | German (default), English (configurable via `LOCALE`) |

## Architecture

### Core Flow
```
User (Telegram) → Bot Commands → Shipment Manager → DB (SQLite)
                                      ↕
                          Tracking APIs (AIS/OpenSky/DHL)
                                      ↓
                          Poller → Alert Handler → Telegram Notification
                                      ↓
                          Dashboard (Leaflet Map + SSE)
```

### Tracking Sources
| Source | Protocol | Data |
|--------|----------|------|
| AISStream | WebSocket | Vessel positions (MMSI) |
| OpenSky Network | REST (poll) | Flight positions (ICAO24/callsign) |
| DHL | REST (poll) | Parcel status + events |

## Project Structure
```
src/
├── index.ts                 # Entry point + graceful shutdown
├── config/
│   ├── schema.ts            # Zod config schema
│   └── defaults.ts          # Env var mapping + loadConfig()
├── db/
│   ├── schema.ts            # Drizzle tables: shipments, shipment_events, vessel_positions
│   └── client.ts            # SQLite connection + migration
├── shipments/
│   ├── types.ts             # ShipmentType, ShipmentStatus, interfaces
│   └── manager.ts           # CRUD + business logic
├── tracking/
│   ├── detector.ts          # Auto-detect tracking number type
│   ├── ais.ts               # AIS WebSocket client
│   ├── opensky.ts           # OpenSky REST client
│   ├── dhl.ts               # DHL REST client
│   └── poller.ts            # Background polling orchestrator
├── alerts/
│   └── alerts.ts            # Delay + status change alert functions
├── bot/
│   └── commands.ts          # Telegram command handlers
├── dashboard/
│   ├── server.ts            # HTTP server + SSE + REST API
│   └── public/              # Leaflet map UI (HTML/CSS/JS)
├── i18n/
│   ├── index.ts             # t(), setLocale()
│   ├── keys.ts              # Typed translation keys
│   └── locales/             # de + en translations
└── config/                  # Defaults + Zod config validation
```

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_OWNER_ID` | Yes | Telegram user ID (owner only) |
| `AISSTREAM_API_KEY` | No | AIS WebSocket API key |
| `OPENSKY_USER` | No | OpenSky username (higher rate limits) |
| `OPENSKY_PASS` | No | OpenSky password |
| `DHL_API_KEY` | No | DHL Tracking API key |
| `DASHBOARD_PORT` | No | Dashboard port (default: 3003) |
| `DASHBOARD_TOKEN` | No | Dashboard auth token |
| `DATABASE_URL` | No | SQLite path (default: ./data/app.db) |
| `LOCALE` | No | Language: de (default) or en |

## Conventions
- Code language: English
- Commit messages: English
- Strict TypeScript (strict: true)
- ESM modules
- Zod for runtime validation
- No classes where functions suffice
- Drizzle for all DB access (no raw SQL)

```bash
pnpm dev          # Development with hot reload
pnpm build        # TypeScript compile
pnpm start        # Production start
pnpm db:generate  # Generate Drizzle migrations
```
