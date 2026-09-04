#!/usr/bin/env bash
# SAMS-016 content-rollforward harness — full reproducible run.
#
# Resets the sams_content_rollforward throwaway DB from scratch (origin/main
# schema), applies the additive migration ×2, seeds, starts the app server +
# webhook receiver, runs the functional test (a/b/d + negative), the browser-
# driven UI test (f), then the DB-lens verify_step (b/c/d/e + immutability),
# and prints the gate summary. DEV/TEST ONLY — touches only sams_content_rollforward.
#
# Usage: bash scripts/content-rollforward/run.sh 2>&1 | tee /tmp/crf-final.log
set -euo pipefail
cd "$(dirname "$0")/../.."
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" 2>/dev/null

DB_URL="postgresql://edward:throwaway@localhost:5555/sams_content_rollforward"
PORT="${PORT:-3200}"
BASE_URL="http://localhost:${PORT}"
set -a; if [ -f ../../.env ]; then . ../../.env; fi; set +a
export DATABASE_URL="$DB_URL"
export BASE_URL
export CRON_SECRET="${CRON_SECRET:-test-cron-secret}"

log() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# 1. Reset DB + provision the origin/main schema.
log "RESET DB (drop + create + provision origin/main schema)"
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d postgres \
  -c "DROP DATABASE IF EXISTS sams_content_rollforward;" -c "CREATE DATABASE sams_content_rollforward;" >/dev/null
git show origin/main:prisma/schema.prisma > /tmp/schema_crf_prov.prisma
npx prisma migrate diff --from-empty --to-schema /tmp/schema_crf_prov.prisma --script > /tmp/schema_crf_prov.sql 2>/dev/null
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_content_rollforward -q -f /tmp/schema_crf_prov.sql >/dev/null
PGPASSWORD=throwaway psql -h localhost -p 5555 -U edward -d sams_content_rollforward -q -c "INSERT INTO \"ActivityLogType\" (id, \"activityType\", \"refTable\", description, \"createdAt\") VALUES ('altype_provider_context_switch', 'PROVIDER_CONTEXT_SWITCH', 'Company', 'Provider staff switched the selected company context', NOW()) ON CONFLICT (\"activityType\") DO NOTHING;" >/dev/null

# 2. Migration ×2 (idempotency) + generate.
log "MIGRATION ×2 (additive + idempotent) + PRISMA GENERATE"
npx tsx scripts/db/migrations/20260904_add_content_pack.ts > /tmp/crf-mig1.log 2>&1
npx tsx scripts/db/migrations/20260904_add_content_pack.ts > /tmp/crf-mig2.log 2>&1
echo "migration run 1: $(grep -c '✓' /tmp/crf-mig1.log) steps, run 2: $(grep -c '✓' /tmp/crf-mig2.log) steps (guarded, no errors)"
npx prisma generate > /dev/null 2>&1

# 3. Seed.
log "SEED (master v1 -> v2 state; tenant RF001 at v1)"
npx tsx scripts/content-rollforward/seed.ts

# 4. Build (fresh) then start server + receiver.
log "BUILD + START SERVER + WEBHOOK RECEIVER"
# Always rebuild fresh so `next start` serves a build whose chunk manifest matches
# .next/static on disk (stale BUILD_ID -> chunk 500s -> browser cannot hydrate).
rm -f .next/BUILD_ID
npm run build > /tmp/crf-build.log 2>&1
fuser -k "${PORT}/tcp" 2>/dev/null || true
fuser -k 3999/tcp 2>/dev/null || true
pkill -9 -f "webhook_receiver" 2>/dev/null || true
sleep 1
PORT="$PORT" THROWAWAY_DB_URL="$DB_URL" bash scripts/content-rollforward/start_test_server.sh > /tmp/crf-server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do if curl -s -o /dev/null "$BASE_URL/login"; then break; fi; sleep 2; done
echo "server pid=$SERVER_PID (webhook receiver is owned by functional_test.mjs on :3999)"

# 5. Functional test (a/b/d + negative) — starts + owns its own :3999 receiver.
log "FUNCTIONAL TEST (owner DoD a, b, d + negative)"
fuser -k 3999/tcp 2>/dev/null || true; pkill -9 -f "webhook_receiver" 2>/dev/null || true; sleep 1
node scripts/content-rollforward/functional_test.mjs || true

# 6. Browser-driven UI test (f) — re-seeds fresh internally.
log "UI DRIVE (owner DoD f — publish → diff → adopt → banner acknowledge)"
node scripts/content-rollforward/ui_drive_test.mjs || true

# 7. DB-lens verify_step (b/c/d/e + immutability).
log "VERIFY_STEP (DB lens — b, c, d, e + immutable-pack negative)"
npx tsx scripts/content-rollforward/verify_step.ts || true

# Stop server/receiver.
kill "$SERVER_PID" 2>/dev/null || true
fuser -k 3999/tcp 2>/dev/null || true

log "GATES"
printf 'tsc:            '; DATABASE_URL="$DB_URL" npx tsc --noEmit >/dev/null 2>&1 && echo OK || echo FAIL
printf 'build:          '; DATABASE_URL="$DB_URL" npm run build >/dev/null 2>&1 && echo OK || echo FAIL
printf 'db:parity:      '; DATABASE_URL="$DB_URL" npm run db:parity > /tmp/crf-parity.log 2>&1 && echo OK || (echo FAIL; tail -20 /tmp/crf-parity.log)
printf 'migration x2:   '; echo "run1=$(grep -c '✓' /tmp/crf-mig1.log) run2=$(grep -c '✓' /tmp/crf-mig2.log)"
printf 'test:isolation: '; DATABASE_URL="$DB_URL" npm run test:isolation > /tmp/crf-iso.log 2>&1 && echo OK || (echo FAIL; tail -25 /tmp/crf-iso.log)
echo "done."
