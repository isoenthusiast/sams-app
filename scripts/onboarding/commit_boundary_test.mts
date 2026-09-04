// SAMS-008 review round-1 fix — COMMIT write-boundary re-validation proof.
// Exercises validateUserRows + provisionUsers directly against the throwaway
// DB (no SAMS001 content needed). Proves the exact defect Conan reproduced:
// a direct commit (no dry-run) with role=Superuser / empty username / duplicate
// is refused with 4xx and ZERO writes.
//
// Run: DATABASE_URL=postgresql://cfdev:cfdev@127.0.0.1:5440/cfdev \
//        node_modules/.bin/tsx scripts/onboarding/commit_boundary_test.mts
import { prisma } from "@/lib/prisma";
import {
  validateUserRows,
  provisionUsers,
  isProvisionBlocked,
  ProvisionValidationError,
  consumeTempPasswords,
} from "@/lib/onboarding";

let failures = 0;
let checks = 0;
const ok = (m: string) => { checks++; console.log("  \u2713 " + m); };
const fail = (m: string) => { checks++; failures++; console.error("  \u2717 FAIL: " + m); };
const assertTrue = (cond: boolean, m: string) => (cond ? ok(m) : fail(m));
const assertEq = (actual: unknown, expected: unknown, m: string) =>
  (actual === expected ? ok(`${m} (= ${expected})`) : fail(`${m}: expected ${expected}, got ${actual}`));

const stamp = Date.now().toString().slice(-6);
const companyID = `WIZBND${stamp}`;

async function userExists(username: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return !!u;
}
async function countUsersForCompany(companyId: string): Promise<number> {
  return prisma.user.count({ where: { companyId } });
}

async function main() {
  console.log(`\n=== SAMS-008 commit write-boundary re-validation proof (company ${companyID}) ===\n`);

  // 1) Create a throwaway company (no content — the users step doesn't need it).
  const company = await prisma.company.create({
    data: { companyID, companyName: "Commit Boundary Test" },
    select: { id: true },
  });
  const companyId = company.id;
  const baseUsers = await countUsersForCompany(companyId);
  assertEq(baseUsers, 0, "company starts with 0 users");

  // 2) EXACT Conan repro A: role=Superuser (PROVISION_ROLES allowlist bypass).
  console.log("\n--- A: role=Superuser refused ---");
  {
    const rows = [{ name: "Super", username: `${companyID}-super`, role: "Superuser" as string }];
    const dry = await validateUserRows(rows);
    assertTrue(dry.invalidRoles.some((r) => r.role === "Superuser"), "validateUserRows flags Superuser");
    assertTrue(isProvisionBlocked(dry), "dry-run isProvisionBlocked=true");
    let status = 0, code = "", report: any = null;
    try {
      await provisionUsers({ companyId, rows });
    } catch (e: any) {
      status = e instanceof ProvisionValidationError ? e.status : -1;
      code = e instanceof ProvisionValidationError ? e.code : "NOT_PROVISION_VALIDATION_ERROR";
      report = e instanceof ProvisionValidationError ? e.report : null;
    }
    assertEq(status, 422, "direct commit role=Superuser -> 422 (was 201 before the fix)");
    assertEq(code, "VALIDATION_BAD_ROWS", "refusal code VALIDATION_BAD_ROWS");
    assertTrue(report && report.invalidRoles.length > 0, "refusal carries validation report");
    assertEq(await userExists(`${companyID}-super`), false, "Superuser row NOT created (zero writes)");
    assertEq(await countUsersForCompany(companyId), baseUsers, "no users added to the company");
  }

  // 3) EXACT Conan repro B: empty username.
  console.log("\n--- B: empty username refused ---");
  {
    const rows = [{ name: "Ghost", username: "", role: "Assessor" as string }];
    const dry = await validateUserRows(rows);
    assertTrue(dry.missingFields.some((m) => m.fields.includes("username")), "validateUserRows flags empty username");
    assertTrue(isProvisionBlocked(dry), "dry-run isProvisionBlocked=true (missing username)");
    let status = 0, code = "";
    try {
      await provisionUsers({ companyId, rows });
    } catch (e: any) {
      status = e instanceof ProvisionValidationError ? e.status : -1;
      code = e instanceof ProvisionValidationError ? e.code : "NOT_PROVISION_VALIDATION_ERROR";
    }
    assertTrue([409, 422].includes(status), `direct commit empty username -> 4xx (got ${status})`);
    assertEq(code, "VALIDATION_BAD_ROWS", "refusal code VALIDATION_BAD_ROWS");
    assertEq(await userExists("Ghost"), false, "empty-username (Ghost) row NOT created");
    assertEq(await countUsersForCompany(companyId), baseUsers, "no users added to the company");
  }

  // 4) missing name.
  console.log("\n--- C: missing name refused ---");
  {
    const rows = [{ name: "", username: `${companyID}-noname`, role: "Assessor" as string }];
    const dry = await validateUserRows(rows);
    assertTrue(dry.missingFields.some((m) => m.fields.includes("name")), "validateUserRows flags missing name");
    assertTrue(isProvisionBlocked(dry), "dry-run isProvisionBlocked=true (missing name)");
    let status = 0;
    try {
      await provisionUsers({ companyId, rows });
    } catch (e: any) {
      status = e instanceof ProvisionValidationError ? e.status : -1;
    }
    assertTrue([409, 422].includes(status), `direct commit missing name -> 4xx (got ${status})`);
    assertEq(await userExists(`${companyID}-noname`), false, "no-name row NOT created");
    assertEq(await countUsersForCompany(companyId), baseUsers, "no users added to the company");
  }

  // 5) duplicate existing username (reserved user) -> 409.
  console.log("\n--- D: duplicate username refused (409) ---");
  {
    // First provision a legit user, then try to create the SAME username again.
    const goodRows = [
      { name: "Alpha", username: `${companyID}-alpha`, role: "Assessor" as string },
      { name: "Beta", username: `${companyID}-beta`, role: "Admin" as string },
    ];
    const prov = await provisionUsers({ companyId, rows: goodRows });
    assertEq(prov.created, 2, "good rows provision OK (created 2)");
    assertEq(await userExists(`${companyID}-alpha`), true, "alpha user exists");

    const clashRows = [{ name: "Alpha Dup", username: `${companyID}-alpha`, role: "Assessor" as string }];
    const dry = await validateUserRows(clashRows);
    assertTrue(dry.duplicates.some((d) => d.kind === "existing"), "validateUserRows flags existing duplicate");
    let status = 0, code = "";
    try {
      await provisionUsers({ companyId, rows: clashRows });
    } catch (e: any) {
      status = e instanceof ProvisionValidationError ? e.status : -1;
      code = e instanceof ProvisionValidationError ? e.code : "";
    }
    assertEq(status, 409, "direct commit duplicate username -> 409");
    assertEq(code, "VALIDATION_DUPLICATES", "refusal code VALIDATION_DUPLICATES");
    assertEq(await countUsersForCompany(companyId), 2, "no NEW user created on clash (still 2)");
  }

  // 6) mixed junk batch (bad role + empty username + clash) -> 4xx, zero writes.
  console.log("\n--- E: mixed junk batch refused (zero writes) ---");
  {
    const before = await countUsersForCompany(companyId);
    const rows = [
      { name: "Bad Role", username: `${companyID}-badrole`, role: "Superuser" as string },
      { name: "", username: `${companyID}-noname2`, role: "Assessor" as string },
      { name: "No User", username: "", role: "Assessor" as string },
      { name: "Clash", username: `${companyID}-alpha`, role: "Assessor" as string },
    ];
    let status = 0, report: any = null;
    try {
      await provisionUsers({ companyId, rows });
    } catch (e: any) {
      status = e instanceof ProvisionValidationError ? e.status : -1;
      report = e instanceof ProvisionValidationError ? e.report : null;
    }
    assertTrue([409, 422].includes(status), `direct commit mixed junk batch -> 4xx (got ${status})`);
    assertTrue(report && report.missingFields.length > 0, "refusal report includes missingFields");
    assertEq(await userExists(`${companyID}-badrole`), false, "bad-role row NOT created");
    assertEq(await userExists(`${companyID}-noname2`), false, "no-name row NOT created");
    assertEq(await countUsersForCompany(companyId), before, "ZERO partial users (count unchanged)");
  }

  // 7) good commit returns wizardId and yields temp passwords exactly once.
  console.log("\n--- F: good commit -> temp passwords one-time ---");
  {
    const rows = [
      { name: "Gamma", username: `${companyID}-gamma`, role: "Assessor" as string },
    ];
    const prov = await provisionUsers({ companyId, rows });
    assertEq(prov.created, 1, "good single row created 1");
    assertTrue(!!prov.wizardId, "commit returns wizardId");
    assertTrue(!JSON.stringify(prov).includes("tempPassword"), "commit response carries NO passwords");
    const pw = consumeTempPasswords(prov.wizardId);
    assertEq(pw.length, 1, "consumeTempPasswords returns exactly 1");
    const pw2 = consumeTempPasswords(prov.wizardId);
    assertEq(pw2.length, 0, "second consume returns 0 (one-time)");
    const u = await prisma.user.findUnique({ where: { username: `${companyID}-gamma` }, select: { passwordHash: true } });
    assertTrue(/^\$2[aby]\$/.test(u?.passwordHash ?? "") && (u?.passwordHash ?? "").length === 60, "stored passwordHash is bcrypt (no plaintext)");
  }

  // ── cleanup ──────────────────────────────────────────────────────────────
  console.log("\n--- cleanup ---");
  await prisma.userCompany.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  ok("throwaway company + users deleted");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("commit_boundary_test errored:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
