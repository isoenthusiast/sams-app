import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SAMS-008 — seed a provider + a client (non-provider) user for the Pilot
 * Onboarding Wizard FUNCTIONAL and UI tests. Idempotent: removes same-username
 * rows first, then re-inserts. Uses DTA001 (a throwaway isolation fixture
 * company) as the client user's home so a non-provider can log in for the 403
 * probe. Never touches real SMDS / OGP / SAMS001 companies.
 */
export const ONBOARDING = {
  providerId: "usr_wiz_provider",
  providerUsername: "wiz_provider",
  providerPassword: "Wiz1234!",
  clientId: "usr_wiz_client",
  clientUsername: "wiz_client",
  clientPassword: "Wiz1234!",
  // Needs an active company for login. DTA001 is a throwaway isolation fixture.
  clientCompanyId: "cmp_dta_a",
  // Throwaway onboarding company the wizard drives.
  testCompanyID: "WIZTEST1",
  testCompanyName: "Wizard Test Client",
};

export async function seedOnboarding() {
  const hash = bcrypt.hashSync(ONBOARDING.providerPassword, 10);

  // Clean prior rows.
  for (const id of [ONBOARDING.providerId, ONBOARDING.clientId]) {
    await prisma.userCompany.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }

  const providerCompany = await prisma.company.findUnique({ where: { companyID: "SAMS001" } });
  await prisma.user.create({
    data: {
      id: ONBOARDING.providerId,
      name: "Wizard Provider",
      username: ONBOARDING.providerUsername,
      passwordHash: hash,
      role: "Admin",
      providerRole: "ProviderAdmin",
      active: true,
      companyId: providerCompany?.id ?? null,
    },
  });

  await prisma.user.create({
    data: {
      id: ONBOARDING.clientId,
      name: "Wizard Client",
      username: ONBOARDING.clientUsername,
      passwordHash: hash,
      role: "Assessor",
      active: true,
      companyId: ONBOARDING.clientCompanyId,
    },
  });

  // Ensure DTA001 is not archived (so the client can log in).
  await prisma.company.updateMany({
    where: { id: ONBOARDING.clientCompanyId },
    data: { archivedAt: null, deletionScheduledAt: null },
  });

  console.log("Seeded SAMS-008 onboarding test users (provider + client).");
}

seedOnboarding()
  .catch((e) => {
    console.error("Onboarding seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
