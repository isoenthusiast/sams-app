import { prisma } from "@/lib/prisma";

/**
 * DB-level verification for Conversation Fabric (SAMS-004):
 *  - ActivityLogType reference rows exist (EVIDENCE_REQUEST_CREATED,
 *    EVIDENCE_REQUEST_STATUS).
 *  - The state-machine transitions wrote EVIDENCE_REQUEST_STATUS rows with
 *    before/after status (scan the last few).
 *  - Comment rows carry authorPlane + visibility as asserted by the API.
 *
 * Run after the functional test has exercised the lifecycle.
 */
async function main() {
  let failures = 0;
  const ok = (m: string) => console.log("  ✓ " + m);
  const fail = (m: string) => { failures++; console.error("  ✗ FAIL: " + m); };

  console.log("=== ActivityLogType reference rows ===");
  const created = await prisma.activityLogType.findUnique({ where: { activityType: "EVIDENCE_REQUEST_CREATED" } });
  const status = await prisma.activityLogType.findUnique({ where: { activityType: "EVIDENCE_REQUEST_STATUS" } });
  if (created) ok("EVIDENCE_REQUEST_CREATED reference row exists"); else fail("EVIDENCE_REQUEST_CREATED missing");
  if (status) ok("EVIDENCE_REQUEST_STATUS reference row exists"); else fail("EVIDENCE_REQUEST_STATUS missing");

  console.log("=== EVIDENCE_REQUEST_STATUS transitions (before/after) ===");
  const transitions = await prisma.activityLog.findMany({
    where: { activityType: "EVIDENCE_REQUEST_STATUS" },
    orderBy: { timestamp: "desc" },
    take: 12,
  });
  console.log(`   (found ${transitions.length} EVIDENCE_REQUEST_STATUS rows)`);
  if (transitions.length === 0) fail("no EVIDENCE_REQUEST_STATUS rows written");
  else {
    // Every row must carry beforeData.status and afterData.status, and they differ.
    let bad = 0;
    for (const t of transitions) {
      const b = (t.beforeData as any)?.status;
      const a = (t.afterData as any)?.status;
      if (!b || !a || b === a) bad++;
    }
    if (bad === 0) ok(`all ${transitions.length} rows carry distinct before/after status`);
    else fail(`${bad}/${transitions.length} rows missing/equal before/after status`);
  }

  console.log("=== EVIDENCE_REQUEST_CREATED audit rows ===");
  const createdRows = await prisma.activityLog.findMany({ where: { activityType: "EVIDENCE_REQUEST_CREATED" } });
  if (createdRows.length >= 3) ok(`wrote ${createdRows.length} EVIDENCE_REQUEST_CREATED rows`); else fail(`only ${createdRows.length} created rows`);

  console.log("=== Comment authorPlane + visibility on fixtures ===");
  const comments = await prisma.comment.findMany({ where: { entityType: "Finding" }, orderBy: { createdAt: "asc" } });
  const hasProviderInternal = comments.some((c) => c.authorPlane === "Provider" && c.visibility === "Internal");
  const hasShared = comments.some((c) => c.visibility === "SharedWithClient");
  const hasClient = comments.some((c) => c.authorPlane === "Client");
  if (hasProviderInternal) ok("has a provider-Internal comment"); else fail("no provider-Internal comment seeded");
  if (hasShared) ok("has a SharedWithClient comment"); else fail("no SharedWithClient comment seeded");
  if (hasClient) ok("has a client-authored comment"); else fail("no client-authored comment seeded");

  console.log(failures === 0 ? "\n=== DB verification PASSED ===" : `\n=== DB verification FAILED (${failures}) ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("DB verify errored:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
