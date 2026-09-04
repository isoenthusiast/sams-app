import { prisma } from "@/lib/prisma";
import { provisionUsers } from "@/lib/onboarding";
import { seedSso, SSO_IDS } from "./seed";

/**
 * SAMS-012 — DB-verify step (owner test-plan evidence, DB-level).
 *   (1) `User.mustChangePassword` column exists with the right type + default false.
 *   (2) SAMS-008 wizard provisioning sets `mustChangePassword=true` on new users
 *       (the one-liner follow-up in src/lib/onboarding.ts).
 *   (3) No plaintext password is ever stored in the User table (bcrypt only).
 *   (4) SSO link-by-email never auto-provisions (an unknown email yields zero rows).
 */
let failures = 0, checks = 0;
function ok(m: string) { checks++; console.log(`  ✓ ${m}`); }
function fail(m: string) { checks++; failures++; console.error(`  ✗ FAIL: ${m}`); }
function assertTrue(cond: boolean, m: string) { if (cond) ok(m); else fail(m); }

async function main() {
  await seedSso();

  console.log("\n=== SAMS-012 DB verify step ===");

  // (1) Column exists + default false (created by the migration / schema).
  const cols = await prisma.$queryRawUnsafe<Array<{ data_type: string; column_default: string | null }>>(
    `SELECT data_type, column_default FROM information_schema.columns WHERE table_name='User' AND column_name='mustChangePassword'`
  );
  assertTrue(cols.length === 1, "User.mustChangePassword column exists");
  assertTrue(cols[0]?.data_type === "boolean" && cols[0]?.column_default === "false", "mustChangePassword = boolean default false");
  const normalUser = await prisma.user.findFirst({ where: { id: SSO_IDS.admin } });
  assertTrue(normalUser?.mustChangePassword === false, "non-wizard user (sso_admin) mustChangePassword=false");

  // (2) provisioning sets the flag for wizard users (SAMS-008 follow-up).
  const cid = `verify_${Date.now()}`;
  await prisma.company.create({ data: { id: cid, companyID: "VERIFY001", companyName: "Verify Co" } });
  const result = await provisionUsers({
    companyId: cid,
    rows: [{ name: "Verify User", username: `vuser_${Date.now()}`, role: "Assessor" }],
  });
  const createdUser = await prisma.user.findFirst({ where: { companyId: cid } });
  assertTrue(!!createdUser && createdUser.mustChangePassword === true, "wizard-provisioned user (provisionUsers) mustChangePassword=true");

  // (3) no plaintext passwords (bcrypt hashes only).
  const allUsers = await prisma.user.findMany({ select: { passwordHash: true } });
  const plaintext = allUsers.filter((u) => !/^\$2[aby]\$/.test(u.passwordHash));
  assertTrue(plaintext.length === 0, `no plaintext password hashes in User table (${allUsers.length} users, bcrypt only)`);

  // (4) SSO link-by-email never auto-provisions: unknown email → zero rows.
  const unknownCount = await prisma.user.count({ where: { email: "nobody-sso@shell.test" } });
  assertTrue(unknownCount === 0, "SSO never auto-provisions: unknown email → 0 rows");

  // Cleanup the verify company.
  await prisma.userCompany.deleteMany({ where: { userId: createdUser?.id } });
  await prisma.user.deleteMany({ where: { id: createdUser?.id } });
  await prisma.company.deleteMany({ where: { id: cid } });

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("SAMS-012 verify errored:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
