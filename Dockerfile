# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:25-slim AS builder

WORKDIR /build

# Install pnpm + OpenSSL (required by Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

# Copy workspace manifests first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY scripts/ scripts/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY apps/server/package.json apps/server/tsconfig.json apps/server/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/tsconfig.node.json apps/web/

# Install all deps (ignore-scripts=false ensures native builds like Prisma engines run)
RUN pnpm install --frozen-lockfile --ignore-scripts=false

# Copy source
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY apps/server/prisma apps/server/prisma
COPY apps/web/src apps/web/src
COPY apps/web/index.html apps/web/
COPY apps/web/vite.config.ts apps/web/
COPY apps/web/postcss.config.js apps/web/
COPY apps/web/tailwind.config.js apps/web/

# Build shared types
RUN pnpm --filter @openflex/shared build

# Generate Prisma client
# Symlink @prisma/* into apps/server/node_modules so Prisma can find the client
RUN mkdir -p apps/server/node_modules && \
    ln -sf /build/node_modules/@prisma apps/server/node_modules/@prisma && \
    ln -sf /build/node_modules/.prisma apps/server/node_modules/.prisma 2>/dev/null || true && \
    ln -sf /build/node_modules/prisma apps/server/node_modules/prisma
RUN pnpm --filter @openflex/server exec prisma generate

# Build server TS
RUN pnpm --filter @openflex/server build

# Build React (Vite)
RUN pnpm --filter @openflex/web build

# Prune dev deps for production
RUN pnpm --filter @openflex/server --prod deploy --legacy /prod/server
RUN cp -r apps/server/dist /prod/server/dist
RUN cp -r apps/server/prisma /prod/server/prisma
RUN cp -r apps/web/dist /prod/server/web-dist
# Copy the downloaded NVENC-capable ffmpeg binary into the production bundle
RUN [ -f bin/ffmpeg ] && cp -r bin /prod/server/bin || true
# Re-generate Prisma client in the production node_modules
RUN cd /prod/server && npx prisma generate --schema=prisma/schema.prisma
# Remove bundled ffmpeg-static binary — container uses system ffmpeg (FFMPEG_PATH)
RUN rm -rf /prod/server/node_modules/ffmpeg-static

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# node:22-alpine keeps the image small (~60 MB compressed base).
# GPU acceleration is provided at runtime by the host — no GPU libs need to be baked in:
#   NVIDIA NVENC — nvidia-container-toolkit injects CUDA libs from the host automatically.
#   AMD / Intel  — VA-API via mesa-va-gallium; pass /dev/dri as a device (see compose).
FROM node:22-alpine AS runtime

# ffmpeg (Alpine build includes NVENC + VA-API), OpenSSL for Prisma
# VA-API for AMD/Intel: mount /dev/dri and the host mesa libs via a bind mount
RUN apk add --no-cache \
    ffmpeg \
    openssl \
    ca-certificates

# Run as non-root user
RUN addgroup -g 1001 -S openflex && \
    adduser  -u 1001 -S -G openflex -H openflex

WORKDIR /app

# Copy built artifacts — --chown avoids a separate chown RUN which would double the layer size
COPY --from=builder --chown=openflex:openflex /prod/server ./

# The web dist lives alongside the server — point WEB_DIST_PATH to it
ENV WEB_DIST_PATH=/app/web-dist

ENV NODE_ENV=production
ENV PORT=7878
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
ENV DATABASE_URL=file:/data/openflex.db
# Use the system ffmpeg (with NVENC) instead of the bundled ffmpeg-static binary
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# Create data dir owned by the non-root user
RUN mkdir -p /data && chown openflex:openflex /data

USER openflex

VOLUME ["/data"]
EXPOSE 7878

CMD ["node", "dist/index.js"]
