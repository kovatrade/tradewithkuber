#!/usr/bin/env bash
# Starts router, API and web in one container. If any of them stops, the container exits so Render restarts it.
set -euo pipefail

PUBLIC_PORT="${PORT:-10000}"
API_PORT=4000
WEB_PORT=3000

# 1) Router first: Render looks for an open port soon after start. Until the API is up it answers 503.
API_PORT=$API_PORT WEB_PORT=$WEB_PORT PORT=$PUBLIC_PORT node /app/deploy/single/router.mjs &
ROUTER=$!

# 2) API: migrations, instrument sync and (optional) demo seed, then the server on 127.0.0.1:4000.
#    Its start script ends with `exec node dist/main.js` and reads PORT.
(cd /app/apps/api && PORT=$API_PORT LISTEN_HOST=127.0.0.1 NODE_HEAP_MB="${API_HEAP_MB:-700}" sh scripts/docker-start.sh) &
API=$!

# 3) Web on 127.0.0.1:3000. Its /graphql relay (unused by browsers here, kept as a fallback) talks to the API directly.
(cd /app/apps/web && NODE_ENV=production API_INTERNAL_URL="http://127.0.0.1:$API_PORT" \
  node --max-old-space-size="${WEB_HEAP_MB:-384}" node_modules/next/dist/bin/next start -p $WEB_PORT -H 127.0.0.1) &
WEB=$!

stop() { kill -TERM "$ROUTER" "$API" "$WEB" 2>/dev/null || true; }
trap 'stop; wait; exit 0' TERM INT

# Exit as soon as any one of them exits.
set +e
wait -n "$ROUTER" "$API" "$WEB"
CODE=$?
echo "[start] a process exited (code $CODE); stopping the others so the service restarts." >&2
stop
wait
exit "${CODE:-1}"
