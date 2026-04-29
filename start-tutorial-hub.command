#!/bin/zsh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Applications/Codex.app/Contents/Resources/node"
APP_URL="http://127.0.0.1:4173"

cd "$APP_DIR"

if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js could not be found."
  echo "Install Node.js or open this project in Codex and run: node server.js"
  read -k "?Press any key to close..."
  exit 1
fi

echo "Starting Interest Tutorial Hub..."
echo "Opening $APP_URL"
echo ""
echo "Leave this Terminal window open while using the app."
echo "Press Control-C here when you want to stop the app."
echo ""

(sleep 1.5 && open "$APP_URL") &
exec "$NODE_BIN" server.js
