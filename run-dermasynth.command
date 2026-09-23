#!/bin/bash
# Double-click to start DermaSynth. Close this window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")" || exit 1
echo "== DermaSynth =="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (version 20 or newer), then double-click this file again."
  read -r -p "Press Return to close." _; exit 1
fi
echo "Node $(node -v)"
[ -d node_modules ] || npm install
# The SQLite module must be built for this Mac; rebuild it if it fails to load.
if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  echo "Rebuilding the SQLite module for this Mac…"
  npm rebuild better-sqlite3
fi
echo
echo "Checking the OpenAI key and model…"
npm run --silent check:openai || echo "(The app still runs; GPT features fall back to local text until this passes.)"
echo
PORT="${PORT:-4173}"
( sleep 2; open "http://127.0.0.1:$PORT/" ) &
echo "Starting on http://127.0.0.1:$PORT  (labelling tool: http://127.0.0.1:$PORT/labelling)"
echo "Leave this window open while you use the app."
npm start
