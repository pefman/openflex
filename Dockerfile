# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /build

# Install pnpm + OpenSSL (required by Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

# Copy workspace manifests first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
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
# Re-generate Prisma client in the production node_modules
RUN cd /prod/server && npx prisma generate --schema=prisma/schema.prisma

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install only what's needed at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts
COPY --from=builder /prod/server ./

# The web dist lives alongside the server — point WEB_DIST_PATH to it
ENV WEB_DIST_PATH=/app/web-dist

ENV NODE_ENV=production
ENV PORT=7878
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
ENV DATABASE_URL=file:/data/openflex.db

VOLUME ["/data"]
EXPOSE 7878

CMD ["node", "dist/index.js"]
