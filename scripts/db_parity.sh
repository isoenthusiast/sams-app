#!/usr/bin/env bash
#
# db:parity — schema ↔ DB drift check (DoD P4)
#
# Diffs the live database (DATABASE_URL) against prisma/schema.prisma and
# prints the SQL that WOULD be emitted to bring the DB in line with the
# schema. Read-only: it emits a --script diff, it never applies anything.
#
# Usage:  npm run db:parity
#
# Requires DATABASE_URL (read from .env if present, else from the environment).
# Known deferred drift (see prisma/schema.prisma Tagging comments) — the diff will
# show the two KnowledgebaseTag `AddForeignKey` statements (cascade deferred,
# additive-only). The nullable companyId deferral is NOT surfaced here (schema and
# DB both declare it nullable); it is a schema-level contract, not a drift.
#
set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env without leaking secrets to stdout.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "db:parity: DATABASE_URL is not set (no .env and not in environment)." >&2
  exit 1
fi

exec npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script
