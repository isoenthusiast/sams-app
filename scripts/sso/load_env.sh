#!/usr/bin/env bash
# Load .env / .env.local into the environment, then exec the given command.
# Usage: bash scripts/sso/load_env.sh <command...>
set -e

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

exec "$@"
