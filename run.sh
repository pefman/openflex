#!/usr/bin/env bash
set -euo pipefail

CONTAINER="openflex"
IMAGE="openflex:latest"
DEV=false

for arg in "$@"; do
  case $arg in
    --dev) DEV=true ;;
  esac
done

if $DEV; then
  # ── Dev mode: run directly with pnpm (no Docker, hot-reload) ──────────────
  _STOPPING=false
  cleanup_dev() {
    $_STOPPING && return
    _STOPPING=true
    echo ""
    echo "Stopping dev servers..."
    kill "$PNPM_PID" 2>/dev/null || true
    # Suppress pnpm's post-kill error/signal messages
    exec 1>/dev/null 2>/dev/null
    wait "$PNPM_PID" 2>/dev/null || true
    exit 0
  }
  trap cleanup_dev INT TERM

  export DATA_DIR="${DATA_DIR:-$(pwd)/data}"
  export DATABASE_URL="file:${DATA_DIR}/openflex.db"
  export JWT_SECRET="${JWT_SECRET:-openflex-dev-secret}"
  export TMDB_API_KEY="${TMDB_API_KEY:-}"
  export LOG_LEVEL="${LOG_LEVEL:-info}"

  mkdir -p "$DATA_DIR"

  echo "Running DB migrations..."
  NODE_PATH="$(pwd)/node_modules" node_modules/.bin/prisma migrate deploy --schema=apps/server/prisma/schema.prisma 2>/dev/null \
    || node_modules/.bin/prisma db push --schema=apps/server/prisma/schema.prisma --accept-data-loss 2>/dev/null || true

  echo "Starting dev servers (server :7878, web :5173)..."
  pnpm --parallel -r dev &
  PNPM_PID=$!
  wait "$PNPM_PID"
else
  # ── Docker mode: build image then run container ────────────────────────────
  cleanup() {
    echo ""
    echo "Stopping container..."
    docker rm -f "$CONTAINER" 2>/dev/null || true
    exit 0
  }
  trap cleanup INT TERM

  docker rm -f "$CONTAINER" 2>/dev/null || true

  echo "Building image..."
  docker build -t "$IMAGE" .

  echo "Starting OpenFlex on http://localhost:7878 ..."
  docker run --rm \
    --name "$CONTAINER" \
    -p 7878:7878 \
    -v "$(pwd)/data:/data" \
    -e PORT=7878 \
    -e DATA_DIR=/data \
    -e DATABASE_URL=file:/data/openflex.db \
    -e JWT_SECRET="${JWT_SECRET:-change-me-in-production}" \
    -e TMDB_API_KEY="${TMDB_API_KEY:-}" \
    -e WEB_DIST_PATH=/app/web-dist \
    -e LOG_LEVEL=info \
    "$IMAGE" &

  DOCKER_PID=$!
  wait "$DOCKER_PID"
fi
