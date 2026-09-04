#!/usr/bin/env bash
# Launch the SAMS-016 content-rollforward test server on PORT (default 3200)
# against the sams_content_rollforward throwaway DB. Sources .env for
# AUTH_SECRET/CRON_SECRET but FORCES DATABASE_URL to the throwaway DB and pins
# AUTH_URL/NEXTAUTH_URL to the test port (so browser signIn redirects locally).
set -e
PORT="${PORT:-3200}"
export THROWAWAY_DB_URL="${THROWAWAY_DB_URL:-postgresql://edward:throwaway@localhost:5555/sams_content_rollforward}"

if [ -f ../../.env ]; then
  set -a
  . ../../.env
  set +a
fi

export DATABASE_URL="$THROWAWAY_DB_URL"
export AUTH_URL="http://localhost:${PORT}"
export NEXTAUTH_URL="http://localhost:${PORT}"
if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required" >&2
  exit 1
fi
if [ -z "${AUTH_SECRET:-}" ]; then
  echo "AUTH_SECRET is required" >&2
  exit 1
fi
exec npx --no-install next start -p "${PORT}"
