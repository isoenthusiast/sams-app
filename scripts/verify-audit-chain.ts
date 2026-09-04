import { prisma } from "@/lib/prisma";
import { verifyAuditChain } from "@/lib/audit-chain";

/**
 * SAMS-015 — Verify an ActivityLog per-company audit chain (auditor-facing CLI).
 *
 *   npx tsx scripts/verify-audit-chain.ts <companyId>
 *
 * Recomputes the company's chain from scratch (same canonicalization + ordering
 * as the writer and the backfill) and reports:
 *   - exit 0 + "OK" when every link verifies,
 *   - exit 1 + the id of the FIRST broken row (or the company id not found).
 *
 * Errors with a clear usage message + non-zero exit for: no argument, an unknown
 * companyId, or a company with no chain rows. Cross-tenant is safe by
 * construction: only `WHERE companyId = <input>` rows are read — a company-A
 * verify never touches company-B rows.
 */
async function main() {
  const companyId = process.argv[2];
  if (!companyId || companyId.trim() === "") {
    console.error("Usage: npx tsx scripts/verify-audit-chain.ts <companyId>");
    process.exit(2);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, companyName: true } });
  if (!company) {
    console.error(`ERROR: unknown companyId '${companyId}' — no such company.`);
    process.exit(2);
  }

  const result = await verifyAuditChain(companyId);
  if (result.ok) {
    console.log(`OK — ${company.companyName} (${companyId}) audit chain verifies (${result.count} row(s)).`);
    process.exit(0);
  }
  console.error(`FAIL — first broken link at ActivityLog row id '${result.firstBrokenId}' (company ${company.companyName}, ${result.count} row(s) in chain).`);
  process.exit(1);
}

main()
  .catch((e) => {
    console.error("Verify errored:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
