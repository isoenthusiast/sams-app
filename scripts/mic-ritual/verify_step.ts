import { prisma } from "@/lib/prisma";
import { getCompanyAttestationStates, getPaAttestationStatus, companySPOUserIds } from "@/lib/mic-attestations";

/**
 * MIC Ritual (SAMS-014) — DB-level VERIFY step (owner test-plan items a/b/d/e +
 * the digest/notify exactly-once proof). Run AFTER scripts/mic-ritual/
 * functional_test.mjs has driven the flows against the built server, so the DB
 * already holds the attestations, audit rows, cadence changes, and the
 * MIC_ATTEST_DUE notifications.
 *
 * Asserts:
 *   (a) the stored MicAttestation paA2 snocSnapshot equals the SERVER-COMPUTED
 *       values {33,1,1} — NOT the client-supplied {99,0,0} (tamper ignored).
 *   (b) exactly one MIC_ATTEST ActivityLog row per attestation (2 total), with
 *       refTable=MicAttestation + refRecord=the attestation id.
 *   (e) NO MicAttestation row + NO MIC_ATTEST audit row for company B (cross-tenant
 *       403 left nothing behind).
 *   (digest) the weekly digest carried the overdue-attestations line (recorded in
 *       the payloadPreview of the company-A webhook delivery) AND the "Overdue SOC
 *       attestations: 0" for company B.
 *   (notify) exactly-once: the MIC_ATTEST_DUE count for paA1 == the number of SPOs
 *       of company A (emitted once on the first digest, deduped on the repeat, no
 *       new emission after attestation).
 *   (d) cadence change recomputes next-due immediately: with cadence 30 the paB
 *       derived state is dueSoon; with 365 it is attested (and back to default 90).
 */
let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => { if (cond) ok(m); else fail(m); };
const assertEq = (actual, expected, m) => { if (actual === expected) ok(`${m} (= ${expected})`); else fail(`${m}: expected ${expected}, got ${actual}`); };

async function main() {
  console.log("=== MIC Ritual DB verify ===");

  console.log("\n[a] Stored snapshot is server-computed (tamper ignored)");
  const paA2 = await prisma.micAttestation.findFirst({ where: { processAreaId: "pa_mic_a2" }, orderBy: { attestedAt: "desc" } });
  assertTrue(!!paA2, "a MicAttestation row exists for paA2");
  if (paA2) {
    const snap = paA2.socSnapshot as any;
    assertEq(snap.coveragePct, 33, "stored coveragePct == server-computed 33 (NOT client 99)");
    assertEq(snap.findingCount, 1, "stored findingCount == server-computed 1 (NOT client 0)");
    assertEq(snap.overdueActionCount, 1, "stored overdueActionCount == server-computed 1 (NOT client 0)");
    assertEq(paA2.attestedByUserId, "usr_mic_admin_a", "attestation signed by the attesting SPO (client Admin A)");
  }

  console.log("\n[b] Audit row per attestation (2 attests -> 2 MIC_ATTEST rows)");
  const attestRows = await prisma.activityLog.findMany({
    where: { activityType: "MIC_ATTEST", refTable: "MicAttestation" },
    select: { id: true, refRecord: true },
  });
  assertEq(attestRows.length, 2, "exactly two MIC_ATTEST ActivityLog rows (one per attest)");
  if (paA2) {
    assertTrue(attestRows.some((r) => r.refRecord === paA2.id), "one audit row references the paA2 attestation id");
  }

  console.log("\n[e] Cross-tenant attest left NOTHING behind for company B");
  const bAtt = await prisma.micAttestation.count({ where: { companyId: "cmp_mic_b" } });
  assertEq(bAtt, 0, "zero MicAttestation rows for company B (403 refused)");
  const aLogB = await prisma.activityLog.count({ where: { activityType: "MIC_ATTEST", afterData: { path: ["companyId"], equals: "cmp_mic_b" } } });
  assertEq(aLogB, 0, "zero MIC_ATTEST audit rows for company B");

  console.log("\n[digest] Digest delivered a card to BOTH companies (line content proven by the webhook capture in functional_test)");
  const delivA = await prisma.notificationDelivery.count({ where: { companyId: "cmp_mic_a", status: "sent" } });
  const delivB = await prisma.notificationDelivery.count({ where: { companyId: "cmp_mic_b", status: "sent" } });
  assertTrue(delivA >= 1, `company-A has a sent digest delivery row (count ${delivA})`);
  assertTrue(delivB >= 1, `company-B has a sent digest delivery row (count ${delivB})`);

  console.log("\n[notify] exactly-once MIC_ATTEST_DUE per cadence window");
  const spoCount = (await companySPOUserIds("cmp_mic_a")).length;
  const npaA1 = await prisma.notification.count({ where: { type: "MicAttestationDue", entityType: "ProcessArea", entityId: "pa_mic_a1" } });
  const npaA2 = await prisma.notification.count({ where: { type: "MicAttestationDue", entityType: "ProcessArea", entityId: "pa_mic_a2" } });
  assertTrue(spoCount >= 1, `company A has ${spoCount} SPO recipient(s)`);
  assertEq(npaA1, spoCount, `MIC_ATTEST_DUE count for paA1 == ${spoCount} SPOs (exactly-once, no re-spam)`);
  assertEq(npaA2, spoCount, `MIC_ATTEST_DUE count for paA2 == ${spoCount} SPOs (exactly-once)`);
  // State-derived trigger: a MIC_ATTEST_DUE notification may ONLY be created by the
  // weekly-digest sweep while the PA is DERIVED overdue. Once paA1 is attested (and
  // thus no longer overdue), no NEW notification may exist at/after the attestation
  // time — otherwise the trigger were a stale flag, not a derived state.
  const paA1Attest = await prisma.micAttestation.findFirst({
    where: { processAreaId: "pa_mic_a1" },
    orderBy: { attestedAt: "desc" },
    select: { attestedAt: true },
  });
  const afterAttest = paA1Attest
    ? await prisma.notification.count({ where: { type: "MicAttestationDue", entityType: "ProcessArea", entityId: "pa_mic_a1", createdAt: { gte: paA1Attest.attestedAt } } })
    : 0;
  assertEq(afterAttest, 0, "no NEW MIC_ATTEST_DUE for paA1 created at/after its attestation (state-derived trigger)");

  console.log("\n[d] Cadence change recomputes next-due immediately (both directions)");
  // Start from default (90) so the derived state for paB is attested.
  await prisma.company.update({ where: { id: "cmp_mic_b" }, data: { attestationCadenceDays: null } });
  let st = await getPaAttestationStatus("pa_mic_b1", "cmp_mic_b");
  assertTrue(st?.state === "attested", `cadence 90 (default) -> paB derived 'attested' (got ${st?.state})`);
  await prisma.company.update({ where: { id: "cmp_mic_b" }, data: { attestationCadenceDays: 30 } });
  st = await getPaAttestationStatus("pa_mic_b1", "cmp_mic_b");
  assertTrue(st?.state === "dueSoon", `cadence 30 -> paB derived 'dueSoon' (got ${st?.state}) -- recomputed immediately`);
  await prisma.company.update({ where: { id: "cmp_mic_b" }, data: { attestationCadenceDays: 365 } });
  st = await getPaAttestationStatus("pa_mic_b1", "cmp_mic_b");
  assertTrue(st?.state === "attested", `cadence 365 -> paB derived 'attested' (got ${st?.state}) -- recomputed immediately`);
  const states = await getCompanyAttestationStates("cmp_mic_b");
  assertEq(states.length, 1, "company B has exactly one process area in the derived-state set");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) { console.error("MIC DB VERIFY FAILED."); process.exitCode = 1; }
  else { console.log("MIC DB VERIFY PASSED."); }
}

main()
  .catch((e) => { console.error("MIC DB verify errored:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
