import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SAMS-012 SSO + force-password-change — throwaway fixtures.
 *
 * One throwaway company (SSO001) + test users:
 *   - sso_force   : Assessor, ACTIVE, mustChangePassword=true, password Temp1234!
 *                   (exercises the force-change flow — credentials login is forced
 *                   onto /change-password until the flag clears).
 *   - sso_admin   : Admin, ACTIVE, mustChangePassword=false, password Admin1234!
 *                   (admin recovery / "credentials login unchanged" (c)).
 *   - sso_active  : Assessor, ACTIVE, email sso.active@shell.test — known active
 *                   user for the Entra link-by-email match (unit/DB test).
 *   - sso_inactive: Assessor, INACTIVE, email sso.inactive@shell.test — Entra
 *                   denial (inactive user must be denied, no account created).
 *
 * Emails are stored lowercase to match the (case-insensitive) link-by-email lookup.
 * Idempotent: cleans up its own rows first. DEV/TEST ONLY.
 */
export const SSO_IDS = {
  company: "cmp_sso",
  force: "usr_sso_force",
  admin: "usr_sso_admin",
  active: "usr_sso_active",
  inactive: "usr_sso_inactive",
};

const PW_FORCE = "Temp1234!";
const PW_ADMIN = "Admin1234!";
const PW_ACTIVE = "Sso1234!";
const PW_INACTIVE = "Sso1234!";
const NEW_PW = "BrandNew12345!";

async function cleanUp() {
  const ids = Object.values(SSO_IDS).filter((v) => v !== SSO_IDS.company);
  await prisma.userCompany.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: SSO_IDS.company } });
}

export async function seedSso(): Promise<void> {
  await cleanUp();

  await prisma.company.create({
    data: { id: SSO_IDS.company, companyID: "SSO001", companyName: "SSO Test Co" },
  });

  const forceHash = bcrypt.hashSync(PW_FORCE, 10);
  const adminHash = bcrypt.hashSync(PW_ADMIN, 10);
  const activeHash = bcrypt.hashSync(PW_ACTIVE, 10);
  const inactiveHash = bcrypt.hashSync(PW_INACTIVE, 10);

  await prisma.user.createMany({
    data: [
      { id: SSO_IDS.force, name: "Force Me", username: "sso_force", passwordHash: forceHash, role: "Assessor", active: true, companyId: SSO_IDS.company, email: "sso.force@example.com", mustChangePassword: true },
      { id: SSO_IDS.admin, name: "Admin Over", username: "sso_admin", passwordHash: adminHash, role: "Admin", active: true, companyId: SSO_IDS.company, email: "sso.admin@example.com", mustChangePassword: false },
      { id: SSO_IDS.active, name: "Active Sso", username: "sso_active", passwordHash: activeHash, role: "Assessor", active: true, companyId: SSO_IDS.company, email: "sso.active@shell.test", mustChangePassword: false },
      { id: SSO_IDS.inactive, name: "Inactive Sso", username: "sso_inactive", passwordHash: inactiveHash, role: "Assessor", active: false, companyId: SSO_IDS.company, email: "sso.inactive@shell.test", mustChangePassword: false },
    ],
  });
  await prisma.userCompany.createMany({
    data: Object.values(SSO_IDS)
      .filter((v) => v !== SSO_IDS.company)
      .map((uid) => ({ id: `uc_${uid}`, userId: uid, companyId: SSO_IDS.company })),
  });
}

export { PW_FORCE, PW_ADMIN, PW_ACTIVE, PW_INACTIVE, NEW_PW };
