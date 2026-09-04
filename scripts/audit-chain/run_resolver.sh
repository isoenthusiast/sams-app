#!/usr/bin/env bash
# SAMS-015b resolver + append-only backfill harness (throwaway DB, DEV/TEST ONLY).
# Proves: (A) resolver unit proof for the 3 new refTables, (C) append-only no-rewrite,
# (B) idempotent re-run, and (F) verify CLI exit-0.
set -euo pipefail
cd "$(dirname "$0")/../.."
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" 2>/dev/null; nvm use 24.19.0 >/dev/null 2>&1

DB_URL="postgresql://edward:throwaway@localhost:5555/sams_audit_chain"
export DATABASE_URL="$DB_URL"
export PGPASSWORD=throwaway
log() { printf '\n\x1b[1m== %s ==\x1b[0m\n' "$*"; }

log "RESET DB"
psql -h localhost -p 5555 -U edward -d postgres \
  -c "DROP DATABASE IF EXISTS sams_audit_chain;" -c "CREATE DATABASE sams_audit_chain;" >/dev/null

log "PROVISION SCHEMA (current schema.prisma == generated client)"
npx prisma migrate diff --from-empty --to-schema ./prisma/schema.prisma --script > /tmp/resolver_schema.sql 2>/dev/null
psql -h localhost -p 5555 -U edward -d sams_audit_chain -q -f /tmp/resolver_schema.sql >/dev/null

log "SEED RESOLVER FIXTURES"
npx tsx scripts/audit-chain/resolver_seed.mts

log "PRECHECK: pre-chain rows exist before migration (expect pre_1/2/3)"
psql -h localhost -p 5555 -U edward -d sams_audit_chain -tAc \
  "SELECT id FROM \"ActivityLog\" WHERE \"companyId\" IS NOT NULL ORDER BY \"createdAt\" ASC;"

log "MIGRATION PASS 1"
npx tsx scripts/db/migrations/20260904_add_audit_chain.ts | sed -n '/RESOLUTION STATS/,$p'
EOF_MARK=1

log "ASSERT (A + C) after pass 1"
npx tsx scripts/audit-chain/resolver_assert.mts

log "SNAPSHOT after pass 1"
npx tsx scripts/audit-chain/resolver_snapshot.mts > /tmp/resolver_after1.jsonl

log "MIGRATION PASS 2 (idempotency re-run)"
npx tsx scripts/db/migrations/20260904_add_audit_chain.ts >/dev/null 2>&1
npx tsx scripts/audit-chain/resolver_snapshot.mts > /tmp/resolver_after2.jsonl

log "IDEMPOTENCY: diff pass1 vs pass2 snapshots"
if diff /tmp/resolver_after1.jsonl /tmp/resolver_after2.jsonl; then
  echo "IDEMPOTENT_OK — pass 2 produced byte-identical (id, companyId, chainHash) state (no rewrite)."
else
  echo "IDEMPOTENCY FAIL — state changed on re-run."; exit 1
fi

log "VERIFY CLI (F) — exit 0 on comp_res_a"
set +e
npx tsx scripts/verify-audit-chain.ts comp_res_a
echo "  verify exit=$?"
set -e

log "GATES"
printf 'tsc:            '; DATABASE_URL="$DB_URL" npx tsc --noEmit >/dev/null 2>&1 && echo OK || echo FAIL
printf 'build:          '; DATABASE_URL="$DB_URL" npm run build >/dev/null 2>&1 && echo OK || echo FAIL
echo "done."
