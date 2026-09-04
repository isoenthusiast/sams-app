import { prisma } from "@/lib/prisma";
import { buildExportPackage } from "@/lib/data-trust-export";
import { publishContentPack } from "@/lib/content-rollforward";

/**
 * SAMS-016 (Master Content Roll-Forward) — DB-level verify_step.
 * Runs AFTER the UI drive so it re-asserts the post-adoption state (b/c/d/e)
 * plus the immutable-pack negative (v2 byte-stable after a v3 publish).
 */
const T = "cmp_rf001";
let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, msg) => { if (cond) ok(msg); else fail(msg); };
const assertEq = (a, b, msg) => { if (a === b) ok(`${msg} (= ${b})`); else fail(`${msg}: expected ${b}, got ${a}`); };

const strip = (name: string) => name.replace(/^\[[^\]]*\]\s+/, "").trim();

async function main() {
  // (b) Tenant baseline = vM.
  const state = await prisma.companyContentState.findUnique({ where: { companyId: T } });
  assertEq(state?.contentVersion, 2, "(b) tenant contentVersion = 2");
  const ctl1 = await prisma.control.findFirst({ where: { companyId: T, controlRef: "C-QM-01" } });
  const ctl3 = await prisma.control.findFirst({ where: { companyId: T, controlRef: "C-ENV-03" } });
  assertEq(ctl1?.statement, "CT1 statement v2", "(b) CT1 updated to master v2 statement");
  assertEq(ctl3?.statement, "CT3 statement v2 (master)", "(b) CT3 = master v2 (conflict applied)");
  const st3 = await prisma.standard.findFirst({ where: { companyId: T, standard: "ISO 45001" } });
  const pa3 = await prisma.processArea.findFirst({ where: { companyId: T, name: { contains: "HSE Mgmt" } } });
  assertTrue(!!st3, "(b) ST3 (ISO 45001) added");
  assertTrue(!!pa3 && strip(pa3.name) === "HSE Mgmt", "(b) PA3 (HSE Mgmt) added");
  const r3 = await prisma.requirement.findFirst({ where: { companyId: T, requirementId: "ISO45001-8.1" } });
  const ctl4 = await prisma.control.findFirst({ where: { companyId: T, controlRef: "C-HSE-04" } });
  assertTrue(!!r3, "(b) R3 added");
  assertTrue(!!ctl4, "(b) CT4 added");
  const mp4 = await prisma.mapControl2Requirement.findFirst({ where: { controlId: ctl4?.id, requirementRId: r3?.rId } });
  assertTrue(!!mp4, "(b) MP4 mapping added");

  // (c) Removed-but-referenced content survives as superseded read-only, link intact.
  const ctl2 = await prisma.control.findFirst({ where: { companyId: T, controlRef: "C-QM-02" } });
  assertTrue(!!ctl2, "(c) CT2 NOT hard-deleted");
  assertEq(ctl2?.contentStatus, "Superseded", "(c) CT2 marked Superseded");
  assertTrue(!!ctl2?.supersededAt, "(c) CT2 supersededAt set");
  const f2 = await prisma.finding.findUnique({ where: { id: "FID-RF-02" }, include: { assessment: true } });
  assertTrue(!!f2, "(c) Finding F2 (references CT2) intact");
  const f2ca = await prisma.controlAssignment.findFirst({ where: { assessmentId: f2?.assessmentId, controlId: ctl2?.id } });
  assertTrue(f2ca?.controlId === ctl2?.id, "(c) F2 → CT2 ControlAssignment link resolves (FK intact)");

  // (d) Audit entry carries the diff; client notified; export shows version.
  const audit = await prisma.activityLog.findFirst({ where: { activityType: "CONTENT_PACK_ADOPT", refTable: "CompanyContentState", refRecord: T } });
  assertTrue(!!audit, "(d) one CONTENT_PACK_ADOPT audit row");
  const after = (audit?.afterData as Record<string, unknown> | null | undefined);
  assertTrue(!!after && typeof after.diff === "object", "(d) audit entry carries the diff");
  const diff = after?.diff as { added: unknown; changed: unknown; conflicts: Array<unknown>; removed: unknown };
  assertTrue(!!diff && !!diff.added && !!diff.changed && !!diff.removed, "(d) diff has added/changed/removed/conflicts");
  assertTrue(Array.isArray(diff?.conflicts) && diff.conflicts.some((c) => JSON.stringify(c).includes("C-ENV-03")), "(e/audit) conflicts array names CT3");
  const notif = await prisma.notification.count({ where: { companyId: T, type: "ContentBaselineUpdated" } });
  assertTrue(notif >= 1, `(d) in-app ContentBaselineUpdated notification(s) = ${notif}`);
  const pkg = await buildExportPackage(T);
  assertEq(pkg.manifest.contentVersion, 2, "(d) export manifest shows contentVersion = 2");

  // (e) Conflict flagged in the audit entry (CT3) + CT3 tenant row = master v2.
  const conflict = (diff?.conflicts ?? []).find((c) => JSON.stringify(c).includes("C-ENV-03")) as { conflictReason?: string } | undefined;
  assertEq(conflict?.conflictReason, "changed-elsewhere", "(e) conflict recorded with conflictReason=changed-elsewhere");

  // Immutability: publishing v3 must leave v2 byte-stable.
  const v2 = await prisma.contentPack.findUnique({ where: { companyId_version: { companyId: "cmp_sams001", version: 2 } } });
  const v2Snap = JSON.stringify(v2?.snapshot);
  await publishContentPack({ fromVersion: 2 });
  const v2after = await prisma.contentPack.findUnique({ where: { companyId_version: { companyId: "cmp_sams001", version: 2 } } });
  assertEq(JSON.stringify(v2after?.snapshot), v2Snap, "(neg) v2 snapshot byte-stable after a v3 publish");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
  prisma.$disconnect();
}

main().catch((e) => { console.error("verify_step errored:", e); process.exitCode = 1; });
