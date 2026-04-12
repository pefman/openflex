#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-pefman/openflex:latest}"
CONTAINER="${CONTAINER:-openflex-latest}"
HOST_PORT="${HOST_PORT:-7878}"
CONTAINER_PORT="${CONTAINER_PORT:-7878}"
DATA_DIR="${DATA_DIR:-$(pwd)/data}"


cleanup() {
  echo ""
  echo "Stopping container ${CONTAINER}..."
  docker stop "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup INT TERM

mkdir -p "${DATA_DIR}"
# Ensure the data dir and any existing SQLite files are writable by the container user (uid 1001)
chmod -R a+rw "${DATA_DIR}" 2>/dev/null || true

if [[ "${PULL:-0}" == "1" ]]; then
  echo "Pulling latest image: ${IMAGE}"
  docker pull "${IMAGE}"
fi

echo "Removing old container (if any): ${CONTAINER}"
docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

echo "Starting OpenFlex on http://localhost:${HOST_PORT}"
echo "Data dir: ${DATA_DIR}"

docker run --rm \
  --name "${CONTAINER}" \
  --user 1001:1001 \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -v "${DATA_DIR}:/data" \
  -e PORT="${CONTAINER_PORT}" \
  -e DATA_DIR=/data \
  -e DATABASE_URL=file:/data/openflex.db \
  -e JWT_SECRET="${JWT_SECRET:-change-me-in-production}" \
  -e TMDB_API_KEY="${TMDB_API_KEY:-}" \
  -e WEB_DIST_PATH=/app/web-dist \
  -e LOG_LEVEL="${LOG_LEVEL:-info}" \
  -e FFMPEG_PATH="${FFMPEG_PATH:-/usr/bin/ffmpeg}" \
  "${IMAGE}"
