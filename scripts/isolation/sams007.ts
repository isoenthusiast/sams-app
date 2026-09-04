import { prisma } from "@/lib/prisma";
import { resolvePortalCompanyId } from "@/lib/portal";

/**
 * SAMS-007 — portal multi-company default-company resolution.
 *
 * `npm run test:isolation` runs this alongside the Data Trust Gate suite. It
 * drives `resolvePortalCompanyId` against a throwaway DB with:
 *   (a) 3-company user, home=SMDS, no param, no cookie → SMDS (NOT empty state)
 *   (b) same user, cookie=OGP, no param → OGP
 *   (c) precedence proven: param beats cookie beats home
 *   (d) zero-company user → guided empty state (companyId null)
 *   (e) regression: 1-company unchanged; cross-tenant param ignored/never leaks
 *
 * Fixtures are self-seeded + self-cleaned so the existing Data Trust Gate
 * fixtures (DTA001/DTA002) are untouched.
 */

const S007 = {
  companies: {
    smds: { id: "cmp_s007_smds", companyID: "SMDS", companyName: "SMDS Home" },
    ogp: { id: "cmp_s007_ogp", companyID: "OGP", companyName: "OGP Selected" },
    third: { id: "cmp_s007_third", companyID: "THIRD", companyName: "Third Co" },
    other: { id: "cmp_s007_other", companyID: "OTHER", companyName: "Other Tenant" },
  },
  users: {
    multi: "usr_s007_multi", // home SMDS; mappings SMDS + OGP + THIRD
    zero: "usr_s007_zero", // no home, no mappings
    single: "usr_s007_single", // home SMDS only
  },
};

let failures = 0;
let checks = 0;

function ok(msg: string) {
  checks++;
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string) {
  checks++;
  failures++;
  console.error(`  ✗ FAIL: ${msg}`);
}
function assertEq(actual: unknown, expected: unknown, msg: string) {
  if (actual === expected) ok(`${msg} (= ${String(expected)})`);
  else fail(`${msg}: expected ${String(expected)}, got ${String(actual)}`);
}
function assertTrue(cond: boolean, msg: string) {
  if (cond) ok(msg);
  else fail(msg);
}

async function cleanUp() {
  const ids = new Set([
    S007.companies.smds.id,
    S007.companies.ogp.id,
    S007.companies.third.id,
    S007.companies.other.id,
  ]);
  const users = Object.values(S007.users);
  await prisma.userCompany.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: [...ids] } } });
}

export async function seedSams007() {
  await cleanUp();
  const { smds, ogp, third, other } = S007.companies;

  await prisma.company.createMany({
    data: [smds, ogp, third, other].map((c) => ({
      id: c.id,
      companyID: c.companyID,
      companyName: c.companyName,
    })),
  });

  // (a/b/c) multi-company user: home = SMDS, mapped to SMDS + OGP + THIRD.
  await prisma.user.create({
    data: {
      id: S007.users.multi,
      name: "S007 Multi",
      username: "s007_multi",
      passwordHash: "s007",
      role: "Assessor",
      active: true,
      companyId: smds.id,
      userCompanies: {
        create: [
          { id: "uc_s007_a", companyId: smds.id },
          { id: "uc_s007_b", companyId: ogp.id },
          { id: "uc_s007_c", companyId: third.id },
        ],
      },
    },
  });

  // (d) zero-company user: no home, no mappings.
  await prisma.user.create({
    data: {
      id: S007.users.zero,
      name: "S007 Zero",
      username: "s007_zero",
      passwordHash: "s007",
      role: "Assessor",
      active: true,
      companyId: null,
    },
  });

  // (e) single-company regression: home SMDS only.
  await prisma.user.create({
    data: {
      id: S007.users.single,
      name: "S007 Single",
      username: "s007_single",
      passwordHash: "s007",
      role: "Assessor",
      active: true,
      companyId: smds.id,
    },
  });
}

export async function runSams007() {
  console.log("\n=== 8. Portal multi-company default resolution (SAMS-007) ===");
  await seedSams007();

  const { smds, ogp, third, other } = S007.companies;
  const multi = S007.users.multi;

  // (a) 3-company user, home=SMDS, no param, no cookie → SMDS, NOT empty state.
  const a = await resolvePortalCompanyId({ userId: multi });
  assertEq(a.companyId, smds.id, "(a) home wins with no param/cookie → SMDS");
  assertEq(a.companies.length, 3, "(a) companies list has all 3"); // not empty state
  assertTrue(a.companyId !== null, "(a) NOT the empty state");

  // (b) same user, cookie=OGP, no param → OGP.
  const b = await resolvePortalCompanyId({ userId: multi, cookieCompanyId: ogp.id });
  assertEq(b.companyId, ogp.id, "(b) cookie beats home → OGP");

  // (c) precedence: param beats cookie beats home.
  const c1 = await resolvePortalCompanyId({
    userId: multi,
    selectedCompanyId: ogp.id,
    cookieCompanyId: smds.id,
  });
  assertEq(c1.companyId, ogp.id, "(c) param beats cookie → OGP");

  const c2 = await resolvePortalCompanyId({
    userId: multi,
    selectedCompanyId: undefined,
    cookieCompanyId: third.id,
  });
  assertEq(c2.companyId, third.id, "(c) cookie beats home → THIRD");

  const c3 = await resolvePortalCompanyId({ userId: multi });
  assertEq(c3.companyId, smds.id, "(c) no param/cookie → home → SMDS");

  // (d) zero-company user → guided empty state.
  const d = await resolvePortalCompanyId({ userId: S007.users.zero });
  assertEq(d.companyId, null, "(d) zero-company → empty state (companyId null)");
  assertEq(d.companies.length, 0, "(d) zero-company → no companies");

  // (e1) single-company regression unchanged.
  const e1 = await resolvePortalCompanyId({ userId: S007.users.single });
  assertEq(e1.companyId, smds.id, "(e) single-company still resolves to its one company");
  const e1b = await resolvePortalCompanyId({ userId: S007.users.single, cookieCompanyId: other.id, selectedCompanyId: other.id });
  assertEq(e1b.companyId, smds.id, "(e) single-company ignores foreign param/cookie");

  // (e2) cross-tenant param not in the user's map → ignored, falls through to default, never leaks.
  const e2 = await resolvePortalCompanyId({
    userId: multi,
    selectedCompanyId: other.id, // NOT a mapped company
    cookieCompanyId: ogp.id, // a valid mapped company
  });
  assertEq(e2.companyId, ogp.id, "(e) cross-tenant param ignored → cookie OGP, never OTHER");
  assertTrue(e2.companyId !== other.id, "(e) never leaks the cross-tenant company");

  // Own the cleanup.
  await cleanUp();

  return { checks, failures };
}
