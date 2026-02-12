#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${OMNICLAW_IMAGE:-${CLAWDBOT_IMAGE:-omniclaw:local}}"
CONFIG_DIR="${OMNICLAW_CONFIG_DIR:-${CLAWDBOT_CONFIG_DIR:-$HOME/.omniclaw}}"
WORKSPACE_DIR="${OMNICLAW_WORKSPACE_DIR:-${CLAWDBOT_WORKSPACE_DIR:-$HOME/.omniclaw/workspace}}"
PROFILE_FILE="${OMNICLAW_PROFILE_FILE:-${CLAWDBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run gateway live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e OMNICLAW_LIVE_TEST=1 \
  -e OMNICLAW_LIVE_GATEWAY_MODELS="${OMNICLAW_LIVE_GATEWAY_MODELS:-${CLAWDBOT_LIVE_GATEWAY_MODELS:-all}}" \
  -e OMNICLAW_LIVE_GATEWAY_PROVIDERS="${OMNICLAW_LIVE_GATEWAY_PROVIDERS:-${CLAWDBOT_LIVE_GATEWAY_PROVIDERS:-}}" \
  -e OMNICLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS="${OMNICLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-${CLAWDBOT_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-}}" \
  -v "$CONFIG_DIR":/home/node/.omniclaw \
  -v "$WORKSPACE_DIR":/home/node/.omniclaw/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
