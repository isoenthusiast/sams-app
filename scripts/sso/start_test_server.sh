#!/usr/bin/env bash
# Launch the SAMS-012 test server on PORT (default 3330), sourcing .env for
# DATABASE_URL/AUTH_SECRET but pinning AUTH_URL/NEXTAUTH_URL to the test port so
# the browser-side signIn redirects to THIS server (not the .env's :3100).
set -e
PORT="${PORT:-3330}"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
export AUTH_URL="http://localhost:${PORT}"
export NEXTAUTH_URL="http://localhost:${PORT}"
exec ./node_modules/.bin/next start -p "${PORT}"
