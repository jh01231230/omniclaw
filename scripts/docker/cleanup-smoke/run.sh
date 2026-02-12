#!/usr/bin/env bash
set -euo pipefail

cd /repo

export OMNICLAW_STATE_DIR="/tmp/omniclaw-test"
export OMNICLAW_CONFIG_PATH="${OMNICLAW_STATE_DIR}/omniclaw.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${OMNICLAW_STATE_DIR}/credentials"
mkdir -p "${OMNICLAW_STATE_DIR}/agents/main/sessions"
echo '{}' >"${OMNICLAW_CONFIG_PATH}"
echo 'creds' >"${OMNICLAW_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${OMNICLAW_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm omniclaw reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${OMNICLAW_CONFIG_PATH}"
test ! -d "${OMNICLAW_STATE_DIR}/credentials"
test ! -d "${OMNICLAW_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${OMNICLAW_STATE_DIR}/credentials"
echo '{}' >"${OMNICLAW_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm omniclaw uninstall --state --yes --non-interactive

test ! -d "${OMNICLAW_STATE_DIR}"

echo "OK"
