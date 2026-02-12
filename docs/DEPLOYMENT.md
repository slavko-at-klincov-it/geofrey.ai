# Deployment Guide

This guide covers deploying geofrey.ai in production. The app is a TypeScript Node.js service that connects to Ollama for local LLM inference and communicates with users via Telegram, WhatsApp, or Signal.

## Prerequisites

- **Node.js 22+** with pnpm
- **Ollama** with the `qwen3:8b` model pulled (`ollama pull qwen3:8b`)
- **SQLite** (bundled via better-sqlite3, no external install needed)
- **Optional:** Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

## Build

```bash
pnpm install
pnpm build          # compiles TypeScript to dist/
```

The compiled output lives in `dist/`. The start command is `node dist/index.js`.

---

## 1. Docker (Recommended)

### docker-compose.yml

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    # GPU passthrough — uncomment for NVIDIA:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

  geofrey:
    build: .
    restart: unless-stopped
    depends_on:
      - ollama
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - OLLAMA_BASE_URL=http://ollama:11434
    volumes:
      - ./data:/app/data
    # Expose only if using WhatsApp webhook:
    # ports:
    #   - "3000:3000"

volumes:
  ollama_data:
```

### Dockerfile

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
COPY drizzle/ drizzle/
RUN pnpm build

FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist dist/
COPY drizzle/ drizzle/
USER node
CMD ["node", "dist/index.js"]
```

### Configuration

Copy the example env file and fill in your values:

```bash
cp .env.example .env
# Edit .env — at minimum set:
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_OWNER_ID
```

### Start

```bash
# Pull the model first (one-time):
docker compose up -d ollama
docker compose exec ollama ollama pull qwen3:8b

# Start everything:
docker compose up -d

# View logs:
docker compose logs -f geofrey
docker compose logs -f ollama
```

### GPU Passthrough (NVIDIA)

Uncomment the `deploy.resources` block in the `ollama` service above. Requires:

- NVIDIA Container Toolkit installed on the host
- `nvidia-smi` working inside docker (`docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`)

For AMD GPUs, use the `ollama/ollama:rocm` image instead and pass `--device /dev/kfd --device /dev/dri`.

### Stopping

```bash
docker compose down        # stop and remove containers
docker compose down -v     # also remove volumes (destroys data!)
```

---

## 2. systemd (Linux Bare-Metal)

### Prerequisites

Install Ollama (which provides its own systemd service):

```bash
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable --now ollama
ollama pull qwen3:8b
```

### Application Setup

```bash
# Create a dedicated user
sudo useradd -r -m -d /opt/geofrey -s /bin/bash geofrey

# Clone and build
sudo -u geofrey bash -c '
  cd /opt/geofrey
  git clone https://github.com/your-org/geofrey.git app
  cd app
  corepack enable
  pnpm install --frozen-lockfile
  pnpm build
'

# Create data directory
sudo mkdir -p /var/lib/geofrey/audit
sudo chown -R geofrey:geofrey /var/lib/geofrey

# Create env file
sudo cp /opt/geofrey/app/.env.example /opt/geofrey/app/.env
sudo chown geofrey:geofrey /opt/geofrey/app/.env
sudo chmod 600 /opt/geofrey/app/.env
# Edit /opt/geofrey/app/.env with your values, and set:
#   DATABASE_URL=/var/lib/geofrey/app.db
#   AUDIT_LOG_DIR=/var/lib/geofrey/audit
```

### geofrey.service

```ini
[Unit]
Description=geofrey.ai - Local AI Orchestrator
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=geofrey
Group=geofrey
WorkingDirectory=/opt/geofrey/app
EnvironmentFile=/opt/geofrey/app/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=geofrey

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/geofrey
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Save this file to `/etc/systemd/system/geofrey.service`.

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable geofrey
sudo systemctl start geofrey
```

### View Logs

```bash
journalctl -u geofrey -f              # follow live
journalctl -u geofrey --since today   # today's logs
journalctl -u ollama -f               # Ollama logs
```

### Restart / Stop

```bash
sudo systemctl restart geofrey
sudo systemctl stop geofrey
```

---

## 3. PM2 (Node.js Process Manager)

### Install PM2

```bash
npm install -g pm2
```

### ecosystem.config.cjs

Create this file in the project root:

```js
module.exports = {
  apps: [
    {
      name: "geofrey",
      script: "dist/index.js",
      cwd: "/opt/geofrey/app",
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/geofrey/error.log",
      out_file: "/var/log/geofrey/out.log",
      merge_logs: true,
    },
  ],
};
```

### Start

```bash
# Build first
pnpm build

# Start with PM2
pm2 start ecosystem.config.cjs

# Save the process list (survives reboots)
pm2 save

# Generate and install startup script
pm2 startup
# Follow the printed command (sudo env PATH=... pm2 startup ...)
```

### Log Management

```bash
pm2 logs geofrey           # follow live
pm2 logs geofrey --lines 100

# Install log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

### Common Commands

```bash
pm2 status                  # process list
pm2 restart geofrey         # restart
pm2 stop geofrey            # stop
pm2 delete geofrey          # remove from PM2
pm2 monit                   # real-time monitoring dashboard
```

---

## 4. General Production Tips

### Environment Variables

- Always use a `.env` file. Never commit it to version control.
- The `.env.example` file documents all available variables.
- At minimum, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, and `NODE_ENV=production`.
- Run `pnpm setup` interactively to generate a validated `.env` file.

### Data Directories

| Path | Contents | Default |
|------|----------|---------|
| `DATABASE_URL` | SQLite database | `./data/app.db` |
| `AUDIT_LOG_DIR` | Hash-chained JSONL audit logs | `./data/audit/` |

For production, use absolute paths outside the application directory:

```env
DATABASE_URL=/var/lib/geofrey/app.db
AUDIT_LOG_DIR=/var/lib/geofrey/audit
```

The database uses WAL mode (`journal_mode = WAL`) for concurrent read performance. Drizzle ORM handles migrations automatically on startup from the `drizzle/` folder.

### Backup Strategy

```bash
# SQLite backup (safe even while running, thanks to WAL mode)
sqlite3 /var/lib/geofrey/app.db ".backup '/backups/geofrey-$(date +%Y%m%d).db'"

# Audit logs (append-only, just copy)
cp -r /var/lib/geofrey/audit/ /backups/audit-$(date +%Y%m%d)/

# Automate with cron:
# 0 3 * * * sqlite3 /var/lib/geofrey/app.db ".backup '/backups/geofrey-$(date +\%Y\%m\%d).db'"
# 0 3 * * * tar czf /backups/audit-$(date +\%Y\%m\%d).tar.gz /var/lib/geofrey/audit/
```

### Monitoring

**Ollama health check:**

```bash
curl -s http://localhost:11434/api/tags | jq '.models[].name'
```

The app performs an automatic Ollama health check with retries on startup.

**Application health:** Watch the audit log directory for recent writes. If no new entries appear for an unexpected period, the service may be stuck.

```bash
ls -lt /var/lib/geofrey/audit/ | head -5
```

**Systemd watchdog (optional):** Add `WatchdogSec=60` to the `[Service]` section if you implement a watchdog ping in the app.

### Memory Requirements

| Component | RAM |
|-----------|-----|
| geofrey (Node.js) | ~256-512 MB |
| Ollama + Qwen3 8B (Q4) | ~5 GB |
| Ollama + Qwen3 14B (Q4) | ~9 GB |
| **Total (8B)** | **~6 GB** |
| **Total (14B)** | **~10 GB** |

Ensure the system has at least 8 GB RAM for the 8B model, or 16 GB for the 14B model, to leave headroom for the OS and other processes.

### WhatsApp Webhook

When using WhatsApp as the messaging platform, the app starts an HTTP server for incoming webhooks. You must:

1. Expose port 3000 (configurable via `WHATSAPP_WEBHOOK_PORT`)
2. Set up a reverse proxy (nginx/Caddy) with HTTPS -- Meta requires HTTPS for webhook verification
3. Configure the webhook URL in the Meta Business dashboard to point to `https://your-domain.com/webhook`

```nginx
# nginx example
server {
    listen 443 ssl;
    server_name geofrey.example.com;

    ssl_certificate /etc/letsencrypt/live/geofrey.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/geofrey.example.com/privkey.pem;

    location /webhook {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Telegram and Signal

- **Telegram:** Uses long polling. No ports need to be exposed. Works behind NAT/firewalls.
- **Signal:** Requires `signal-cli` running as a daemon with JSON-RPC. Communicates via Unix socket (default: `/var/run/signal-cli/socket`). No ports need to be exposed.

### Security Checklist

- [ ] `.env` file has `chmod 600` and is owned by the service user
- [ ] `NODE_ENV=production` is set
- [ ] The service runs as a non-root user
- [ ] The database and audit directories have restricted permissions
- [ ] If using WhatsApp, HTTPS is configured for the webhook endpoint
- [ ] `MCP_ALLOWED_SERVERS` is set to restrict which MCP servers can be used
- [ ] If Claude Code is enabled, `CLAUDE_CODE_MAX_BUDGET_USD` limits API spend

### Updating

```bash
cd /opt/geofrey/app
git pull
pnpm install --frozen-lockfile
pnpm build
# Then restart via your process manager:
sudo systemctl restart geofrey   # systemd
pm2 restart geofrey              # PM2
docker compose up -d --build     # Docker
```

Database migrations run automatically on startup via Drizzle ORM. The `schema_version` table tracks the current schema version.
