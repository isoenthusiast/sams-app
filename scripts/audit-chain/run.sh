#!/usr/bin/env bash
# SAMS-015 audit-chain harness — full reproducible run.
#
# Resets the sams_audit_chain throwaway DB from scratch (d1e2e56 schema), seeds,
# runs the migration, starts the app server + webhook receiver, then runs the
# owner-DoD functional test (a–f) + verify CLI + tamper proofs, and prints the
# gate summary. DEV/TEST ONLY — touches only the sams_audit_chain database.
#
# Usage: bash scripts/audit-chain/run.sh 2>&1 | tee /tmp/ac-final.log
set -euo pipefail
cd "$(dirname "$0")/../.."
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" 2>/dev/null

DB_URL="postgresql://edward:throwaway@localhost:5555/sams_audit_chain"
PORT="${PORT:-3300}"
BASE_URL="http://localhost:${PORT}"
set -a; if [ -f ../../.env ]; then . ../../.env; fi; set +a
export CRON_SECRET="${CRON_SECRET:-}"
export DATABASE_URL="$DB_URL"
export BASE_URL

log() { printf '\n\x1b[1m== %s ==\x1b[0m\n' "$*"; }

# 1. Reset DB.
log "RESET DB (drop + create + provision d1e2e56 schema)"
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d postgres \
  -c "DROP DATABASE IF EXISTS sams_audit_chain;" -c "CREATE DATABASE sams_audit_chain;" >/dev/null
git show d1e2e56:prisma/schema.prisma > /tmp/schema_prov.prisma
npx prisma migrate diff --from-empty --to-schema /tmp/schema_prov.prisma --script > /tmp/schema_prov.sql 2>/dev/null
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_audit_chain -q -f /tmp/schema_prov.sql >/dev/null
# --from-empty provisions schema only; re-insert the data-row the provider-role
# migration normally creates (isolation suite asserts this reference row exists).
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_audit_chain -q -c "INSERT INTO \"ActivityLogType\" (id, \"activityType\", \"refTable\", description, \"createdAt\") VALUES ('altype_provider_context_switch', 'PROVIDER_CONTEXT_SWITCH', 'Company', 'Provider staff switched the selected company context', NOW()) ON CONFLICT (\"activityType\") DO NOTHING;"

# 2. Seed + migration.
log "SEED + MIGRATION"
npx tsx scripts/audit-chain/seed.ts
npx tsx scripts/db/migrations/20260904_add_audit_chain.ts | sed -n '/RESOLUTION STATS/,$p'

# 3. Start server + receiver (kill any prior on our ports).
log "START SERVER + WEBHOOK RECEIVER"
fuser -k "${PORT}/tcp" 2>/dev/null || true
fuser -k 3999/tcp 2>/dev/null || true
sleep 1
rm -f /tmp/ac-webhook.jsonl
PORT=3999 node scripts/audit-chain/webhook_receiver.mjs > /tmp/ac-receiver.log 2>&1 &
RECV_PID=$!
PORT="$PORT" THROWAWAY_DB_URL="$DB_URL" bash scripts/audit-chain/start_test_server.sh > /tmp/ac-server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do if curl -s -o /dev/null "$BASE_URL/login"; then break; fi; sleep 2; done
echo "receiver pid=$RECV_PID server pid=$SERVER_PID"

# 4. Functional test (owner DoD a–f).
log "FUNCTIONAL TEST (owner DoD a-f)"
npx tsx scripts/audit-chain/functional_test.mts

# 5. Verify CLI + tamper proofs.
log "VERIFY CLI (a) + TAMPER PROOFS (c)"
set +e  # these steps intentionally return non-zero (usage=2, unknown=2, tamper=1)
echo "-- verify A --"; npx tsx scripts/verify-audit-chain.ts cmp_ac_a; echo "  exit=$?"
echo "-- verify B --"; npx tsx scripts/verify-audit-chain.ts cmp_ac_b; echo "  exit=$?"
echo "-- no-arg (expect 2) --"; npx tsx scripts/verify-audit-chain.ts 2>&1; echo "  exit=$?"
echo "-- unknown company (expect 2) --"; npx tsx scripts/verify-audit-chain.ts DOES_NOT_EXIST 2>&1; echo "  exit=$?"

ORIG=$(PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_audit_chain -tAc "SELECT description FROM \"ActivityLog\" WHERE id='logac_a3';")
echo "-- tamper: UPDATE logac_a3.description --"
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_audit_chain -q -c "UPDATE \"ActivityLog\" SET description='TAMPERED' WHERE id='logac_a3';"
npx tsx scripts/verify-audit-chain.ts cmp_ac_a 2>&1 | tail -1; echo "  exit=${PIPESTATUS[0]}"
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_audit_chain -q -c "UPDATE \"ActivityLog\" SET description='${ORIG}' WHERE id='logac_a3';"
echo "-- tamper fix: verify A (expect OK) --"; npx tsx scripts/verify-audit-chain.ts cmp_ac_a 2>&1 | tail -1; echo "  exit=${PIPESTATUS[0]}"
echo "-- tamper: DELETE logac_a3 (expect fail at gap) --"
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_audit_chain -q -c "DELETE FROM \"ActivityLog\" WHERE id='logac_a3';"
npx tsx scripts/verify-audit-chain.ts cmp_ac_a 2>&1 | tail -1; echo "  exit=${PIPESTATUS[0]}"
set -e

# Stop the server/receiver.
kill "$SERVER_PID" "$RECV_PID" 2>/dev/null || true

log "GATES"
printf 'tsc:            '; DATABASE_URL="$DB_URL" npx tsc --noEmit >/dev/null 2>&1 && echo OK || echo FAIL
printf 'build:          '; DATABASE_URL="$DB_URL" npm run build >/dev/null 2>&1 && echo OK || echo FAIL
printf 'db:parity:      '; DATABASE_URL="$DB_URL" npm run db:parity 2>/dev/null | grep -q "empty migration" && echo OK || echo FAIL
printf 'migration x2:   '; DATABASE_URL="$DB_URL" npx tsx scripts/db/migrations/20260904_add_audit_chain.ts >/dev/null 2>&1 && echo OK || echo FAIL
printf 'test:isolation: '; DATABASE_URL="$DB_URL" npm run test:isolation >/tmp/ac-iso.log 2>&1 && echo OK || echo FAIL
echo "done."
