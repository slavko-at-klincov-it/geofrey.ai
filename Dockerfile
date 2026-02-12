# ---------------------------------------------------------------------------
# Stage 1: Builder — install dependencies and compile TypeScript
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder

# Install pnpm via corepack (built into Node 22)
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
# better-sqlite3 requires build tools for native bindings
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    pnpm install --frozen-lockfile && \
    apt-get purge -y python3 make g++ && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy source code and build configs
COPY src/ src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle/ drizzle/

# Compile TypeScript to dist/
RUN pnpm build

# Prune devDependencies after build
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Stage 2: Runtime — lean production image
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime

# better-sqlite3 native binding needs libstdc++ at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 geofrey && \
    useradd --uid 1001 --gid geofrey --shell /bin/sh --create-home geofrey

# Copy production artifacts from builder
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle/ drizzle/
COPY --from=builder /app/drizzle.config.ts ./

# Create data directory (SQLite + audit logs) and set ownership
RUN mkdir -p /app/data/audit && chown -R geofrey:geofrey /app/data

# Persistent volume for database and audit logs
VOLUME ["/app/data"]

# Switch to non-root user
USER geofrey

# No ports exposed by default:
# - Telegram uses long polling (outbound only)
# - WhatsApp webhook needs port 3000 — expose via docker-compose or `docker run -p 3000:3000`

CMD ["node", "dist/index.js"]
