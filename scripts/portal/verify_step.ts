import { prisma } from "@/lib/prisma";
import { getPortalDashboard, getPortalActivity } from "@/lib/portal";

/**
 * DB-level verification for the Client Portal (SAMS-005). Run AFTER
 * scripts/portal/functional_test.mjs has exercised the HTTP flow:
 *  - SOC dashboard counts (getPortalDashboard) match a hand SQL GROUP BY.
 *  - The saved management response is persisted (text + At + By).
 *  - An ActivityLog MANAGEMENT_RESPONSE_SAVE row was written (audit trail).
 *  - The provider-Internal comment is seeded but EXCLUDED from the portal feed.
 */
let failures = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const fail = (m: string) => { failures++; console.error("  ✗ FAIL: " + m); };

const A = "cmp_pf_a";
const B = "cmp_pf_b";
const CLIENT_A = "usr_pf_client_a";
const FINDING_A = "FID-PF-A01";

async function main() {
  console.log("=== SOC dashboard #51 counts vs hand SQL (company A) ===");
  const hand = await prisma.requirement.groupBy({
    by: ["socStatus"],
    where: { companyId: A },
    _count: { _all: true },
  });
  const handMap: Record<string, number> = {};
  let handTotal = 0;
  for (const g of hand) {
    handMap[String(g.socStatus) ?? "null"] = g._count._all;
    handTotal += g._count._all;
  }
  const fully = handMap["FullyComply"] ?? 0;
  const partial = handMap["PartiallyComply"] ?? 0;
  const notComply = handMap["NotComply"] ?? 0;
  const notAssessed = Math.max(0, handTotal - fully - partial - notComply);
  const assessed = fully + partial + notComply;
  const expectedPct = assessed === 0 ? null : Math.round((fully / assessed) * 100);

  const dash = await getPortalDashboard(A, CLIENT_A);
  if (dash.soc.total === handTotal) ok(`soc.total ${dash.soc.total} === hand SQL ${handTotal}`); else fail(`soc.total ${dash.soc.total} != ${handTotal}`);
  if (dash.soc.fullyComply === fully) ok(`fullyComply ${dash.soc.fullyComply} === ${fully}`); else fail(`fullyComply ${dash.soc.fullyComply} != ${fully}`);
  if (dash.soc.coveragePct === expectedPct) ok(`coveragePct ${dash.soc.coveragePct} === ${expectedPct}`); else fail(`coveragePct ${dash.soc.coveragePct} != ${expectedPct}`);

  console.log("=== Management response persisted (stamped) ===");
  const finding = await prisma.finding.findUnique({ where: { id: FINDING_A }, select: { managementResponse: true, managementResponseAt: true, managementResponseById: true } });
  if (finding?.managementResponse === "We acknowledge and will remediate by Q4.") ok("managementResponse persisted"); else fail(`managementResponse = ${finding?.managementResponse}`);
  if (finding?.managementResponseAt) ok("managementResponseAt stamped"); else fail("managementResponseAt missing");
  if (finding?.managementResponseById === CLIENT_A) ok("managementResponseById stamped to client A"); else fail(`managementResponseById = ${finding?.managementResponseById}`);

  console.log("=== ActivityLog MANAGEMENT_RESPONSE_SAVE (audit trail) ===");
  const audit = await prisma.activityLog.findMany({ where: { activityType: "MANAGEMENT_RESPONSE_SAVE" } });
  if (audit.length >= 1) ok(`wrote ${audit.length} MANAGEMENT_RESPONSE_SAVE row(s)`); else fail("no MANAGEMENT_RESPONSE_SAVE row written");

  console.log("=== Provider-Internal comment seeded but excluded from portal ===");
  const internal = await prisma.comment.findFirst({ where: { body: "PF A INTERNAL-ONLY note" } });
  if (internal) ok("provider-Internal comment seeded in DB"); else fail("provider-Internal comment NOT seeded");
  const feed = await getPortalActivity(A, { page: 1 });
  const hasInternal = feed.items.some((i) => i.detail.includes("PF A INTERNAL-ONLY note") || i.title.includes("PF A INTERNAL-ONLY note"));
  if (!hasInternal) ok("portal feed EXCLUDES provider-Internal comment"); else fail("portal feed LEAKS provider-Internal comment");

  console.log(failures === 0 ? "\n=== DB verification PASSED ===" : `\n=== DB verification FAILED (${failures}) ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("verify_step errored:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
