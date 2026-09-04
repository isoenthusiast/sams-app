#!/usr/bin/env bash
# Launch the SAMS-015 audit-chain test server on PORT (default 3300) against the
# sams_audit_chain throwaway DB, sourcing .env for AUTH_SECRET/CRON_SECRET but
# FORCING DATABASE_URL to the throwaway DB (the .env holds the PROD URL, which
# must never be the test target) and pinning AUTH_URL/NEXTAUTH_URL to the test port.
set -e
PORT="${PORT:-3300}"
export THROWAWAY_DB_URL="${THROWAWAY_DB_URL:-postgresql://edward:throwaway@localhost:5555/sams_audit_chain}"

# Load secrets (AUTH_SECRET, CRON_SECRET) but NOT DATABASE_URL from .env.
if [ -f ../../.env ]; then
  set -a
  # shellcheck disable=SC1091
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
exec ./node_modules/.bin/next start -p "${PORT}"
