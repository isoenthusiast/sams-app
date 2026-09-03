import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { seedFixtures } from "./fixtures";

/**
 * Seed a throwaway admin + a client company user for the Data Trust Gate
 * FUNCTIONAL (server/HTTP + driven-UI) tests. Never run against real companies.
 *
 * Reuses the isolation fixtures (DTA001 / DTA002). Adds:
 *   - usr_dta_admin  (role Admin, belongs to DTA001) — drives the admin UI/API.
 *   - an archived-CANDIDATE: DTA001 is archived during the functional flow to
 *     prove login-deny + hidden-from-selector + reinstate.
 */
export const FUNCTIONAL = {
  adminId: "usr_dta_admin",
  adminUsername: "dta_admin",
  adminPassword: "Admin1234!",
  clientUsername: "dta_alpha", // from fixtures, companyId DTA001
  clientPassword: "Test1234!",
  companyA: "cmp_dta_a", // DTA001
  companyB: "cmp_dta_b", // DTA002
};

export async function seedFunctional() {
  await seedFixtures(); // ensure DTA001/DTA002 + users exist

  const hash = bcrypt.hashSync(FUNCTIONAL.adminPassword, 10);

  // Clean prior admin rows
  await prisma.userCompany.deleteMany({ where: { userId: FUNCTIONAL.adminId } });
  await prisma.user.deleteMany({ where: { id: FUNCTIONAL.adminId } });

  await prisma.user.create({
    data: {
      id: FUNCTIONAL.adminId,
      name: "DTA Admin",
      username: FUNCTIONAL.adminUsername,
      passwordHash: hash,
      role: "Admin",
      active: true,
      companyId: FUNCTIONAL.companyA,
    },
  });
  await prisma.userCompany.create({
    data: { id: "uc_dta_admin", userId: FUNCTIONAL.adminId, companyId: FUNCTIONAL.companyA },
  });

  // Ensure DTA001 starts NOT archived so the flow can archive then reinstate it.
  await prisma.company.updateMany({ where: { id: FUNCTIONAL.companyA }, data: { archivedAt: null, deletionScheduledAt: null } });

  console.log("Seeded Functional test: admin + DTA001/DTA002 fixtures.");
}

seedFunctional()
  .catch((e) => { console.error("Functional seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
