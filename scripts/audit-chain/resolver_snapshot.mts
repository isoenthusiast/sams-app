import { prisma } from "@/lib/prisma";

// Dump every ActivityLog row's (id, companyId, chainHash) sorted, so the
// orchestrator can `diff` snapshots to prove idempotency (no rewrite on re-run).
async function main() {
  const rows = await prisma.activityLog.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, companyId: true, chainHash: true },
  });
  for (const r of rows) console.log(JSON.stringify(r));
}
main().finally(() => prisma.$disconnect());
