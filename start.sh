#!/usr/bin/env bash
# start.sh — start TradeOpsJournal (backend + frontend) via Docker Compose
# Usage: ./start.sh [--build]
#
# Pass --build to force a full rebuild (needed after changing source files,
# requirements.txt, or package.json).

set -euo pipefail

COLIMA_PROFILE="personal"
DOCKER_SOCKET="$HOME/.colima/${COLIMA_PROFILE}/docker.sock"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Start Colima if not running ──────────────────────────────────────────
COLIMA_STATUS=$(colima list 2>/dev/null | awk -v p="$COLIMA_PROFILE" '$1==p{print $2}')

if [[ "$COLIMA_STATUS" != "Running" ]]; then
  echo "▶ Starting Colima profile '${COLIMA_PROFILE}'..."
  colima start -p "$COLIMA_PROFILE"
else
  echo "✔ Colima '${COLIMA_PROFILE}' is already running"
fi

# ── 2. Point Docker at the right socket ─────────────────────────────────────
export DOCKER_HOST="unix://${DOCKER_SOCKET}"
echo "✔ DOCKER_HOST → ${DOCKER_HOST}"

# ── 3. Run docker compose ────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

if [[ "${1:-}" == "--build" ]]; then
  echo "▶ Building and starting containers..."
  docker compose up --build
else
  echo "▶ Starting containers (use --build to rebuild)..."
  docker compose up
fi
