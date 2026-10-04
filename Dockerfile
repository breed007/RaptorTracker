# syntax=docker/dockerfile:1
#
# Debian slim rather than Alpine: it matches Raspberry Pi OS, and the native
# modules (better-sqlite3, bcrypt) ship prebuilt glibc binaries for both
# linux/amd64 and linux/arm64, so nothing compiles during the build.

# ── 1. Build the web client ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci --no-audit --no-fund
COPY client/ ./client/
# vite.config reads the version from the root package.json and writes the
# bundle to ../dist, so the root manifest has to be present for the build.
COPY package.json ./
RUN cd client && npm run build

# ── 2. Install production server dependencies ───────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get(); require('bcrypt').hashSync('x', 4)"

# ── 3. Runtime ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    UPLOAD_DIR=/data/uploads \
    TRUST_PROXY=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=client /app/dist ./dist
COPY package.json server.js ./
COPY server/ ./server/

# Run unprivileged. The data volume is owned by the same user so SQLite and
# uploads stay writable without chmod on the host.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node

EXPOSE 3000
VOLUME /data

# No curl in the slim image — Node's fetch is enough for a health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
