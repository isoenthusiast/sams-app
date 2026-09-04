import { prisma } from "@/lib/prisma";
import { canonicalizeRow, computeChainHash } from "@/lib/audit-chain";

/**
 * Additive, idempotent schema sync for SAMS-015 (Tamper-Evident Audit Trail,
 * Phase 4, Feature C) — the ActivityLog hash chain.
 *
 * Adds (ONLY ADDs — never drops/alters, safe on the shared Postgres DB, no
 * `prisma db push`):
 *   1. `ActivityLog.companyId TEXT?`  — per-row owning company discriminator
 *      (the ActivityLog remains a GLOBAL log by design; this makes the per-company
 *      chain possible). Nullable; null = chainless (global/operator events).
 *   2. `ActivityLog.chainHash TEXT?`  — sha256(prevChainHash ‖ canonical row fields).
 *   3. Indexes on companyId + chainHash.
 *
 * BACKFILL (the acceptance gate at prod landing):
 *   - Resolves `companyId` for every unresolved row from its refTable/refRecord,
 *     in cursor batches (keyset-paginated, resumable — re-running skips rows
 *     already assigned because the filter is `companyId IS NULL`).
 *   - Then computes the per-company chain in `(createdAt, id)` order using the
 *     SAME canonicalization/ordering as the write path and the verify CLI
 *     (`@/lib/audit-chain`), writing each row's `chainHash`.
 *   - Emits per-refTable RESOLVED vs UNRESOLVED resolution stats (Conan condition
 *     #1). A high unresolved share is surfaced in the review handoff.
 *
 * Idempotent ×2: every statement is guarded (ADD COLUMN IF NOT EXISTS /
 * CREATE INDEX IF NOT EXISTS) and the chain recompute is deterministic — the
 * same inputs always produce the same chainHash.
 *
 * Deploy order (spec §Deploy): migration → prisma generate → build → E2E.
 * `npx tsx scripts/db/migrations/20260904_add_audit_chain.ts` (dev and prod).
 */

const BATCH = 500;

/**
 * Batched company resolution. For each distinct refTable present in the batch,
 * issue ONE `IN` query and build a Map<refRecord, companyId|null>. This is
 * efficient on large prod logs and MUST agree with `resolveCompanyId` in
 * `@/lib/audit-chain` (identical table→company mapping).
 */
async function resolveCompanyIdBatch(
  rows: Array<{ id: string; refTable: string | null; refRecord: string | null }>
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const byTable = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.refTable || !r.refRecord) continue;
    const list = byTable.get(r.refTable) ?? [];
    list.push(r.refRecord);
    byTable.set(r.refTable, list);
  }
  for (const [table, records] of byTable) {
    const ids = [...new Set(records)];
    if (table === "Company") {
      for (const rec of ids) out.set(rec, rec);
    } else if (table === "Assessment") {
      const found = await prisma.assessment.findMany({ where: { id: { in: ids } }, select: { id: true, companyId: true } });
      for (const f of found) out.set(f.id, f.companyId ?? null);
    } else if (table === "User") {
      const found = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, userCompanies: { select: { companyId: true }, take: 1 } },
      });
      for (const f of found) out.set(f.id, f.companyId ?? f.userCompanies?.[0]?.companyId ?? null);
    } else if (table === "Finding") {
      const found = await prisma.finding.findMany({
        where: { id: { in: ids } },
        select: { id: true, assessment: { select: { companyId: true } } },
      });
      for (const f of found) out.set(f.id, f.assessment?.companyId ?? null);
    } else if (table === "Action") {
      const found = await prisma.action.findMany({
        where: { id: { in: ids } },
        select: { id: true, finding: { select: { assessment: { select: { companyId: true } } } } },
      });
      for (const f of found) out.set(f.id, f.finding?.assessment?.companyId ?? null);
    } else if (table === "EvidenceRequest") {
      const found = await prisma.evidenceRequest.findMany({ where: { id: { in: ids } }, select: { id: true, companyId: true } });
      for (const f of found) out.set(f.id, f.companyId ?? null);
    } else if (table === "ApiKey") {
      const found = await prisma.apiKey.findMany({ where: { id: { in: ids } }, select: { id: true, companyId: true } });
      for (const f of found) out.set(f.id, f.companyId ?? null);
    } else if (table === "Control") {
      const found = await prisma.control.findMany({ where: { id: { in: ids } }, select: { id: true, companyId: true } });
      for (const f of found) out.set(f.id, f.companyId ?? null);
    }
    // Unknown refTable → those recs stay unresolved (out has no entry → null).
  }
  return out;
}

async function main() {
  console.log("Adding SAMS-015 audit-chain schema…");

  // 1. Columns (additive, guarded).
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "chainHash" TEXT;`);
  console.log("✓ ActivityLog.companyId / chainHash");

  // 2. Indexes.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActivityLog_companyId_idx" ON "ActivityLog"("companyId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActivityLog_chainHash_idx" ON "ActivityLog"("chainHash");`);
  console.log("✓ ActivityLog companyId/chainHash indexes");

  // 3. Backfill companyId (resumable: only rows still companyId IS NULL).
  console.log("Backfilling companyId (keyset batches)…");
  const stats = new Map<string, { resolved: number; unresolved: number }>();
  let totalResolved = 0;
  let totalUnresolved = 0;
  let lastCreatedAt: Date | null = null;
  let lastId: string | null = null;

  for (;;) {
    const rows = await prisma.activityLog.findMany({
      where: {
        companyId: null,
        ...(lastId && lastCreatedAt
          ? { OR: [{ createdAt: { gt: lastCreatedAt } }, { createdAt: lastCreatedAt, id: { gt: lastId } }] }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      select: { id: true, createdAt: true, refTable: true, refRecord: true },
    });
    if (rows.length === 0) break;

    const resolvedMap = await resolveCompanyIdBatch(rows);
    const updates = rows.flatMap((r) => {
      const table = r.refTable ?? "(none)";
      const s = stats.get(table) ?? { resolved: 0, unresolved: 0 };
      const companyId = resolvedMap.get(r.refRecord ?? "") ?? null;
      if (companyId) {
        s.resolved++;
        stats.set(table, s);
        return [{ id: r.id, companyId }];
      }
      s.unresolved++;
      stats.set(table, s);
      return [];
    });

    for (const u of updates) {
      await prisma.activityLog.update({ where: { id: u.id }, data: { companyId: u.companyId } });
      totalResolved++;
    }
    totalUnresolved += rows.length - updates.length;

    lastCreatedAt = rows[rows.length - 1].createdAt;
    lastId = rows[rows.length - 1].id;
  }
  console.log("✓ companyId backfill complete");
  console.log("\n── RESOLUTION STATS (SAMS-015, per refTable: resolved / unresolved) ──");
  const showTables = [...stats.keys()].sort();
  for (const t of showTables) {
    const s = stats.get(t)!;
    console.log(`  ${t.padEnd(20)} resolved=${String(s.resolved).padStart(5)}  unresolved=${String(s.unresolved).padStart(4)}`);
  }
  console.log(`  ${"TOTAL".padEnd(20)} resolved=${String(totalResolved).padStart(5)}  unresolved=${String(totalUnresolved).padStart(4)}`);
  const unresolvedPct = totalResolved + totalUnresolved === 0 ? 0 : (totalUnresolved / (totalResolved + totalUnresolved)) * 100;
  console.log(`  unresolved share = ${unresolvedPct.toFixed(1)}%`);

  // 4. Compute the per-company chain (same canonicalization/ordering as writer+verifier).
  console.log("\nComputing per-company audit chains…");
  const companies = await prisma.activityLog.findMany({
    where: { companyId: { not: null } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  let chained = 0;
  for (const { companyId } of companies) {
    const rows = await prisma.activityLog.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true, timestamp: true, description: true, activityType: true,
        username: true, refTable: true, refRecord: true, beforeData: true,
        afterData: true, companyId: true,
      },
    });
    let prev = "";
    for (const row of rows) {
      const canonical = canonicalizeRow({
        id: row.id,
        timestamp: row.timestamp,
        description: row.description,
        activityType: row.activityType,
        username: row.username,
        refTable: row.refTable,
        refRecord: row.refRecord,
        beforeData: row.beforeData,
        afterData: row.afterData,
        companyId: row.companyId as string,
      });
      const chainHash = computeChainHash(prev, canonical);
      if (row.chainHash !== chainHash) {
        await prisma.activityLog.update({ where: { id: row.id }, data: { chainHash } });
      }
      prev = chainHash;
      chained++;
    }
  }
  console.log(`✓ chained ${chained} row(s) across ${companies.length} company chain(s)`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
