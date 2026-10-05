#!/usr/bin/env bash
# Starts the Worker API (wrangler dev :8787) and Vite dev server (:5173).
cd "$(dirname "$0")"
nohup npm run dev --prefix apps/worker-api > /tmp/worker-dev.log 2>&1 &
nohup npx vite --port 5173 --strictPort --host > /tmp/vite-dev.log 2>&1 &
sleep 12
echo "=== worker (8787) ==="; lsof -iTCP:8787 -sTCP:LISTEN 2>/dev/null | tail -1 || true
echo "=== vite (5173) ==="; lsof -iTCP:5173 -sTCP:LISTEN 2>/dev/null | tail -1 || true
