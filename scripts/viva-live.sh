#!/usr/bin/env bash
# One command for every live (GPT) measurement used in the viva materials.
# Run on the Mac, from the repo folder, with the keys in .env:
#   npm run eval:viva-refresh
# Takes about 10 to 15 minutes and roughly USD 0.50 of OpenAI usage.
# Results land in data/evaluation/reports/ (*.latest.md); nothing is committed.
set -u
cd "$(dirname "$0")/.."
echo "DermaSynth viva refresh: about 8 to 10 minutes. Progress is printed below."
LOG=data/evaluation/reports/viva-live.log
if curl -s --max-time 2 http://127.0.0.1:4173/api/health >/dev/null; then
  echo "A DermaSynth server is already running on port 4173 (probably old code). Stop it (Ctrl+C in its terminal) and run this again."
  exit 1
fi
if ! node scripts/check-openai.mjs; then
  echo "OpenAI is not answering (most often: no API credits left). Fix that, then run this again."
  exit 1
fi
mkdir -p data/evaluation/reports
echo "viva-refresh $(date '+%Y-%m-%d %H:%M')" > "$LOG"
step() { echo; echo "=== $1  (started $(date +%H:%M:%S))"; echo "=== $1" >> "$LOG"; shift; "$@" 2>&1 | tee -a "$LOG"; }


echo; echo "=== starting the server for the end-to-end runs"
node server.mjs > data/evaluation/reports/viva-refresh-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s http://127.0.0.1:4173/api/health >/dev/null && break; sleep 1; done
step "4/6 Live end-to-end evaluation (latency)" node scripts/run-live-evaluation.mjs
step "5/6 Repeatability (3 profiles x 5 runs)" node scripts/run-repeatability.mjs
kill $SERVER 2>/dev/null
step "6/6 Offline reports refresh" bash -c "node scripts/evaluate-triage.mjs >/dev/null && node scripts/report-safety-traceability.mjs >/dev/null && echo done"
echo; echo "All done. Tell Claude: 'viva refresh finished'."
