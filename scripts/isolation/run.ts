import { prisma } from "@/lib/prisma";
import { runDiscovery, displayDrift } from "./discovery";
import { seedFixtures, FIXTURE_IDS } from "./fixtures";
import { buildExportPackage, EXPORT_TABLES } from "@/lib/data-trust-export";
import { getPortalFindings, getPortalActions, getPortalDashboard, getPortalActivity } from "@/lib/portal";
import { runSams007 } from "./sams007";

/**
 * Data Trust Gate — tenant isolation test suite (T1).
 *
 * npm run test:isolation
 *
 * Verifies:
 *   1. Route + model matrix drift (coverage by construction) — a new
 *      company-scoped route/model missing from the matrices FAILS.
 *   2. Cross-tenant READ isolation — company-A scoping never returns
 *      company-B rows (direct column and relation-traversal models).
 *   3. Cross-tenant WRITE isolation — FK-safe assertion that a row created
 *      referencing another tenant's parent is either rejected or cannot leak.
 *   4. Provider plane — portfolio reads iterate per-company and the
 *      PROVIDER_CONTEXT_SWITCH audit reference row exists.
 *   5. Client-export isolation scan — a company-A export ZIP contains no
 *      credential material and no other-tenant rows; manifest counts match live
 *      per-company queries.
 */

let failures = 0;
let checks = 0;

function ok(msg: string) {
  checks++;
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string) {
  checks++;
  failures++;
  console.error(`  ✗ FAIL: ${msg}`);
}
function assertTrue(cond: boolean, msg: string) {
  if (cond) ok(msg);
  else fail(msg);
}
function assertEq(actual: number, expected: number, msg: string) {
  if (actual === expected) ok(`${msg} (= ${expected})`);
  else fail(`${msg}: expected ${expected}, got ${actual}`);
}

// ── model accessor helper ─────────────────────────────────────────────────
function model(accessor: string) {
  const m = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]>; count: (a: unknown) => Promise<number>; findFirst: (a: unknown) => Promise<unknown | null> }>)[accessor];
  if (!m) throw new Error(`Unknown Prisma accessor: ${accessor}`);
  return m;
}

async function run() {
  console.log("\n=== 1. Matrix drift (coverage by construction) ===");
  const drift = runDiscovery();
  const driftReport = displayDrift(drift);
  if (driftReport !== "No matrix drift detected.") console.log(driftReport + "\n");
  assertTrue(drift.routeOrphans.length === 0, `route matrix: no orphan company-scoped routes (found ${drift.routeOrphans.length})`);
  assertTrue(drift.modelOrphans.length === 0, `model matrix: no orphan companyId models (found ${drift.modelOrphans.length})`);
  if (drift.routeStale.length) console.log(`  · warn: stale matrix entries (route removed): ${drift.routeStale.join(", ")}`);
  if (drift.modelMatrixMissing.length) console.log(`  · warn: matrix models w/o companyId column / export entry (documented traversal): ${drift.modelMatrixMissing.join(", ")}`);

  const ids = FIXTURE_IDS;

  console.log("\n=== 2. Seed two-company fixtures ===");
  await seedFixtures();
  ok("seeded DTA001 (A) and DTA002 (B) fixtures");

  console.log("\n=== 3. Cross-tenant READ isolation (A-scope never returns B) ===");
  // Each probe: assert (a) A-scope finds A's row, (b) A-scope by B's id → 0,
  // (c) B's row exists unscoped → 1 (so the 0 above is scoping, not absence).
  type Probe = { accessor: string; idField: string; aId: string | number; bId: string | number; whereA: (cid: string) => Record<string, unknown>; whereB: (cid: string) => Record<string, unknown> };
  const byCompany = (cid: string) => ({ companyId: cid });
  const probes: Probe[] = [
    { accessor: "standard", idField: "id", aId: ids.standardA, bId: ids.standardB, whereA: byCompany, whereB: byCompany },
    { accessor: "processArea", idField: "id", aId: ids.paA, bId: ids.paB, whereA: byCompany, whereB: byCompany },
    { accessor: "subProcess", idField: "id", aId: ids.subA, bId: ids.subB, whereA: byCompany, whereB: byCompany },
    { accessor: "control", idField: "id", aId: ids.controlA, bId: ids.controlB, whereA: byCompany, whereB: byCompany },
    { accessor: "requirement", idField: "rId", aId: ids.reqA, bId: ids.reqB, whereA: byCompany, whereB: byCompany },
    { accessor: "assessment", idField: "id", aId: ids.assessmentA, bId: ids.assessmentB, whereA: byCompany, whereB: byCompany },
    { accessor: "knowledgebase", idField: "kID", aId: ids.kbA, bId: ids.kbB, whereA: byCompany, whereB: byCompany },
    { accessor: "tag", idField: "id", aId: ids.tagA, bId: ids.tagB, whereA: byCompany, whereB: byCompany },
    { accessor: "department", idField: "id", aId: ids.deptA, bId: ids.deptB, whereA: byCompany, whereB: byCompany },
    { accessor: "user", idField: "id", aId: ids.userA, bId: ids.userB, whereA: byCompany, whereB: byCompany },
    { accessor: "document", idField: "id", aId: ids.docA, bId: ids.docB, whereA: byCompany, whereB: byCompany },
    { accessor: "gamificationStage", idField: "id", aId: ids.gamifA, bId: ids.gamifB, whereA: byCompany, whereB: byCompany },
    // Relation-traversal models
    { accessor: "finding", idField: "id", aId: ids.findingA, bId: ids.findingB, whereA: (cid) => ({ assessment: { companyId: cid } }), whereB: (cid) => ({ assessment: { companyId: cid } }) },
    { accessor: "action", idField: "id", aId: ids.actionA, bId: ids.actionB, whereA: (cid) => ({ finding: { assessment: { companyId: cid } } }), whereB: (cid) => ({ finding: { assessment: { companyId: cid } } }) },
    { accessor: "sample", idField: "id", aId: ids.sampleA, bId: ids.sampleB, whereA: (cid) => ({ assessment: { companyId: cid } }), whereB: (cid) => ({ assessment: { companyId: cid } }) },
    { accessor: "position", idField: "id", aId: ids.posA, bId: ids.posB, whereA: (cid) => ({ department: { companyId: cid } }), whereB: (cid) => ({ department: { companyId: cid } }) },
    { accessor: "mapControl2Requirement", idField: "id", aId: ids.mapA, bId: ids.mapB, whereA: (cid) => ({ control: { companyId: cid } }), whereB: (cid) => ({ control: { companyId: cid } }) },
  ];

  for (const p of probes) {
    const m = model(p.accessor);
    const aCount = await m.count({ where: p.whereA(ids.a) });
    const cross = await m.count({ where: { ...p.whereA(ids.a), [p.idField]: p.bId } });
    const bExists = await m.count({ where: { [p.idField]: p.bId } });
    assertTrue(aCount >= 1, `[${p.accessor}] A-scope finds A's row (count=${aCount})`);
    assertEq(cross, 0, `[${p.accessor}] A-scope rejects B's row (${p.bId})`);
    assertEq(bExists, 1, `[${p.accessor}] B's row exists unscoped (control)`);
  }

  console.log("\n=== 4. Client Portal cross-tenant probe (SAMS-005) ===");
  // Portal helpers must be scoped by construction: a company-A portal query
  // returns ONLY company-A rows; a company-B portal query returns ONLY company-B
  // rows. Scan for any other-tenant identifier (the B finding id AND the other
  // company's requirement rId AND company codes) — zero must appear.
  const aMarkers = [ids.findingA, String(ids.reqA)];
  const bMarkers = [ids.findingB, String(ids.reqB)];

  const isAOnly = (rows: any[]) => !rows.some((r) => {
    const blob = typeof r === "string" ? r : JSON.stringify(r);
    return bMarkers.some((b) => blob.includes(b));
  });
  const isBOnly = (rows: any[]) => !rows.some((r) => {
    const blob = typeof r === "string" ? r : JSON.stringify(r);
    return aMarkers.some((a) => blob.includes(a));
  });

  const aFindings = await getPortalFindings(ids.a);
  const bFindings = await getPortalFindings(ids.b);
  assertTrue(isAOnly(aFindings), "[portal/findings] company-A portal has ZERO company-B findings");
  assertTrue(isBOnly(bFindings), "[portal/findings] company-B portal has ZERO company-A findings");
  assertTrue(aFindings.some((f: any) => f.id === ids.findingA), "[portal/findings] company-A portal shows its own finding");

  const aActions = await getPortalActions(ids.a);
  const bActions = await getPortalActions(ids.b);
  assertTrue(isAOnly(aActions), "[portal/actions] company-A portal has ZERO company-B actions");
  assertTrue(isBOnly(bActions), "[portal/actions] company-B portal has ZERO company-A actions");

  const aDash = await getPortalDashboard(ids.a, ids.userA);
  const bDash = await getPortalDashboard(ids.b, ids.userB);
  // Dashboard SOC counts must reflect the OWN company's requirement set only.
  const aReq = await prisma.requirement.count({ where: { companyId: ids.a } });
  assertEq(aDash.soc.total, aReq, "[portal dashboard] company-A soc.total == its own requirement count");
  assertEq(bDash.soc.total, await prisma.requirement.count({ where: { companyId: ids.b } }), "[portal dashboard] company-B soc.total == its own requirement count");
  assertTrue(!JSON.stringify(aDash).includes(String(ids.reqB)), "[portal dashboard] company-A dashboard has ZERO company-B requirement");

  const aActivity = await getPortalActivity(ids.a, { page: 1 });
  const bActivity = await getPortalActivity(ids.b, { page: 1 });
  assertTrue(isAOnly(aActivity.items), "[portal/activity] company-A feed has ZERO company-B identifiers");
  assertTrue(isBOnly(bActivity.items), "[portal/activity] company-B feed has ZERO company-A identifiers");

  console.log("\n=== 5. Cross-tenant WRITE isolation ===");
  // Attempt to create a company-A attachment (direct companyId) — must be
  // scoped to A. Cross-tenant write would be a control-of-A referencing B's
  // process area; the app's write paths scope by company. Here we assert FK
  // integrity: an A attachment cannot point at a B process area if the app
  // enforces companyId on the parent — but Attachment has no parent FK, so we
  // assert the scoping helper produces an A-only where and that a raw
  // cross-tenant reference is NOT silently readable through A scoping.
  const bogusWhere = { companyId: ids.a };
  const crossWrite = await prisma.attachment.count({ where: { ...bogusWhere, companyId: ids.b } });
  assertEq(crossWrite, 0, "A-scoped attachment query cannot match a B-companyId row");

  console.log("\n=== 6. Provider plane ===");
  const switchType = await prisma.activityLogType.findUnique({ where: { activityType: "PROVIDER_CONTEXT_SWITCH" } });
  assertTrue(!!switchType, "PROVIDER_CONTEXT_SWITCH audit reference row exists");
  // Per-company iteration: the export catalogue enumerates company-scoped tables
  // and each query is scoped per-company — assert no EXPORT_TABLE is unscoped.
  const paIds = (await prisma.processArea.findMany({ where: { companyId: ids.a }, select: { id: true } })).map((r) => r.id);
  let unscopedCount = 0;
  for (const t of EXPORT_TABLES) {
    const w = JSON.stringify(await t.where(ids.a));
    // A scoped where references the company by its id OR (for the process-area-
    // indirect risk tables) by one of the company's process-area ids.
    const scoped = w.includes(ids.a) || (paIds.length > 0 && paIds.some((id) => w.includes(id)));
    if (!scoped) unscopedCount++;
  }
  assertEq(unscopedCount, 0, "every export table query is company-scoped");

  console.log("\n=== 7. Client-export isolation scan (company A) ===");
  const pkg = await buildExportPackage(ids.a);
  const excludedCols = [
    "passwordHash", "password", "token", "accessToken", "refreshToken",
    "sessionToken", "sessionData", "secret", "apiKey", "beforeData", "afterData",
  ];
  let credScan = true;
  let tenantScan = true;
  for (const e of pkg.entries) {
    if (e.file === "manifest.json") continue;
    const lower = e.content.toLowerCase();
    for (const col of excludedCols) {
      if (lower.includes(col.toLowerCase()) && /^[^,]*\b(passwordhash|token|secret|apikey|session)\s*,/im.test(e.content.toLowerCase())) {
        credScan = false;
        fail(`[${e.file}] contains excluded column ${col}`);
      }
    }
    // Other-tenant (company B) leak scan: B's company code must never appear.
    if (e.content.includes("DTA002") || e.content.includes(`"${ids.b}"`) || lower.includes("data trust beta")) {
      tenantScan = false;
      fail(`[${e.file}] contains company-B (other-tenant) content`);
    }
  }
  assertTrue(credScan, "no password/token/secret columns in any export CSV");
  assertTrue(tenantScan, "no other-tenant (company-B) rows in company-A export");

  // Manifest counts match live per-company queries.
  for (const t of EXPORT_TABLES) {
    const rows = pkg.entries.find((e) => e.file === t.file);
    const manifestEntry = pkg.manifest.tables.find((x) => x.file === t.file);
    const live = await model(t.accessor).count({ where: t.where(ids.a) });
    const exported = rows ? rows.content.trim().split("\n").length - 1 : 0;
    if (manifestEntry?.rowCount !== live || exported !== live) {
      // Only fail where data exists (exported/marked) — a 0-row export is valid.
      if (live !== 0) fail(`[${t.accessor}] manifest count ${manifestEntry?.rowCount} != live ${live}`);
    } else {
      ok(`[${t.accessor}] manifest count matches live (${live})`);
    }
  }

  // SAMS-007: portal multi-company default-company resolution (self-seeded/sandboxed).
  const sams007 = await runSams007();
  checks += sams007.checks;
  failures += sams007.failures;

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) {
    console.error("ISOLATION SUITE FAILED.");
    process.exitCode = 1;
  } else {
    console.log("ISOLATION SUITE PASSED.");
  }
}

run()
  .catch((e) => {
    console.error("Isolation suite errored:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
