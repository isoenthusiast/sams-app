import { prisma } from "@/lib/prisma";

// Seed a throwaway company DTA_DEL whose safety net has EXPIRED, so the manual
// hard-delete script can be exercised safely (never touches a real company).
const id = "cmp_dta_del";
async function main() {
  await prisma.company.deleteMany({ where: { id } }); // idempotent
  await prisma.company.create({
    data: {
      id,
      companyID: "DTA-DEL",
      companyName: "Data Trust Pending Delete",
      archivedAt: new Date(Date.now() - 40 * 86400000),
      deletionScheduledAt: new Date(Date.now() - 31 * 86400000), // 31 days ago -> net expired
    },
  });
  await prisma.standard.create({ data: { id: "std_dta_del", standard: "ISO-DEL", companyId: id } });
  await prisma.requirement.create({
    data: { rId: 9001, standard: "ISO-DEL", pId: "P-DEL", requirementId: "DEL-REQ", clauseContent: "x", intentOutcome: "x", clauseApplicability: "yes", companyId: id },
  });
  console.log("Seeded DTA_DEL (expired safety net).");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
