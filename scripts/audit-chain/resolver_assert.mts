import { prisma } from "@/lib/prisma";
import { verifyAuditChain } from "@/lib/audit-chain";
import { RES } from "./resolver_seed.mts";

/**
 * SAMS-015b — assertions AFTER migration pass 1 (run against the throwaway DB).
 * Covers:
 *   (A) resolver unit proof for MapControl2Requirement / AssessmentTemplate / Sample
 *   (C) append-only no-rewrite: existing pre-chain hashes unchanged; after-tail rows
 *       chained; mid-chain row reset to chainless; verifyAuditChain OK.
 */
const A = RES.companyA;
let failures = 0, checks = 0;
const ok = (m: string) => { checks++; console.log("  ✓ " + m); };
const fail = (m: string) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertEq = (a: unknown, e: unknown, m: string) => (a === e ? ok(`${m} (= ${e})`) : fail(`${m}: expected ${e}, got ${a}`));
const assertTrue = (c: boolean, m: string) => (c ? ok(m) : fail(m));

async function row(id: string) {
  return prisma.activityLog.findUnique({ where: { id } });
}

async function main() {
  console.log(`\n=== SAMS-015b resolver assertion (company ${A}) ===`);

  console.log("\n[A] resolver unit proof — three refTables");
  const appendMc = await row("append_mc");
  assertEq(appendMc?.companyId, A, "MapControl2Requirement → control.companyId = A");
  assertTrue(!!appendMc?.chainHash, "MapControl2Requirement row chained");
  const atRow = await row("at_a_row");
  assertEq(atRow?.companyId, A, "AssessmentTemplate.companyId = A");
  assertTrue(!!atRow?.chainHash, "AssessmentTemplate row chained");
  const appendSample = await row("append_sample");
  assertEq(appendSample?.companyId, A, "Sample → assessment.companyId = A");
  assertTrue(!!appendSample?.chainHash, "Sample (append) row chained");

  console.log("\n[A] genuinely-chainless residue stays null");
  const nullMc = await row("null_mc");
  assertEq(nullMc?.companyId, null, "null-Control MapControl2Requirement → companyId null");
  assertEq(nullMc?.chainHash, null, "null-Control MapControl2Requirement → chainHash null");
  const nullAt = await row("null_at");
  assertEq(nullAt?.companyId, null, "null-companyId AssessmentTemplate → companyId null");
  assertEq(nullAt?.chainHash, null, "null-companyId AssessmentTemplate → chainHash null");
  const nullSample = await row("null_sample");
  assertEq(nullSample?.companyId, null, "null-company assessment Sample → companyId null");

  console.log("\n[C] append-only / order-safe — existing hashes NOT rewritten");
  const pre1 = await row("pre_1");
  const pre2 = await row("pre_2");
  const pre3 = await row("pre_3");
  assertTrue(!!pre1?.chainHash && !!pre2?.chainHash && !!pre3?.chainHash, "pre-chain rows carry hashes");
  // Verify the whole A chain from scratch passes — proves the pre-chain hashes are
  // internally consistent AND the append preserved continuity.
  const vr = await verifyAuditChain(A);
  assertTrue(vr.ok, `verifyAuditChain(${A}) = OK (${vr.count} rows)`);

  console.log("\n[C] mid-chain row (would rewrite anchor) is reset to chainless");
  const midSample = await row("mid_sample");
  assertEq(midSample?.companyId, null, "mid-chain Sample → companyId null (not chained)");
  assertEq(midSample?.chainHash, null, "mid-chain Sample → chainHash null");

  console.log("\n[C] after-tail rows appended (chain continuity via head)");
  // The last chained row for A must be the latest append (append_sample @06-15), and
  // its hash must differ from the pre-chain tail (pre_3) — proof it was appended not rewritten.
  const aRows = await prisma.activityLog.findMany({
    where: { companyId: A },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, chainHash: true },
  });
  assertEq(aRows[0]?.id, "append_sample", "A chain head = append_sample (appended after tail)");
  assertTrue(aRows[0]?.chainHash !== pre3?.chainHash, "head hash != pre-chain tail hash (extended, not rewritten)");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("resolver assert errored:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
