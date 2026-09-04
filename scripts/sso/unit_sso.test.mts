import { resolveEntraSignIn, SSO_DENIAL_REDIRECT, type SsoUserProbe } from "@/lib/sso";
import { prisma } from "@/lib/prisma";
import { seedSso, SSO_IDS } from "./seed";

/**
 * SAMS-012 SSO link-by-email decision gate — UNIT-LEVEL proof (owner test plan (b),
 * "signIn-callback logic with a mocked profile", since Edward's Entra registration
 * is not yet in env → the live SSO round-trip is landing-gated).
 *
 * Part 1 (MOCKED): `resolveEntraSignIn` is a pure function taking an injected user
 * lookup — verifies the deny decisions for unknown / inactive / no-email profiles
 * and the allow decision for a known ACTIVE profile, plus the denial redirect URL.
 *
 * Part 2 (DB-backed): resolves the decision against the REAL seeded DB using the
 * exact lookup shape the signIn callback uses (findFirst by email, active gate),
 * and confirms the NO AUTO-PROVISION rule: an unknown email is denied and no user
 * row exists for it afterward (SSO never creates an account).
 */
let failures = 0, checks = 0;
function ok(m: string) { checks++; console.log(`  ✓ ${m}`); }
function fail(m: string) { checks++; failures++; console.error(`  ✗ FAIL: ${m}`); }
function assertTrue(cond: boolean, m: string) { if (cond) ok(m); else fail(m); }
function assertEq<T>(a: T, b: T, m: string) { if (a === b) ok(`${m} (= ${b})`); else fail(`${m}: expected ${b}, got ${a}`); }

// A deterministic fake lookup (mocked profile → DB probe).
function fakeLookup(rows: Record<string, SsoUserProbe | null>) {
  return async (email: string): Promise<SsoUserProbe | null> => rows[email] ?? null;
}

async function main() {
  console.log("\n=== SAMS-012 SSO link-by-email decision gate (unit) ===");

  console.log("\n[1] Mocked profile decisions");
  const knownActive: SsoUserProbe = { id: "usr_x", role: "Assessor", active: true };
  const knownInactive: SsoUserProbe = { id: "usr_y", role: "Assessor", active: false };

  const allow = await resolveEntraSignIn("known@shell.test", fakeLookup({ "known@shell.test": knownActive }));
  assertTrue(allow.ok === true, "known ACTIVE email → allow (ok:true)");

  const unknown = await resolveEntraSignIn("ghost@shell.test", fakeLookup({ "known@shell.test": knownActive }));
  assertTrue(!unknown.ok && unknown.reason === "unknown", "unknown email → denied (reason=unknown)");

  const inactive = await resolveEntraSignIn("inactive@shell.test", fakeLookup({ "inactive@shell.test": knownInactive }));
  assertTrue(!inactive.ok && inactive.reason === "inactive", "inactive user → denied (reason=inactive)");

  const noEmail = await resolveEntraSignIn(null, fakeLookup({}));
  assertTrue(!noEmail.ok && noEmail.reason === "no_email", "no email on profile → denied (reason=no_email)");

  const blankEmail = await resolveEntraSignIn("   ", fakeLookup({}));
  assertTrue(!blankEmail.ok && blankEmail.reason === "no_email", "blank email → denied (reason=no_email)");

  assertEq(SSO_DENIAL_REDIRECT.unknown, "/login?error=sso_account_not_found", "unknown → redirect /login?error=sso_account_not_found");
  assertEq(SSO_DENIAL_REDIRECT.inactive, "/login?error=sso_account_not_found", "inactive → redirect /login?error=sso_account_not_found");
  assertEq(SSO_DENIAL_REDIRECT.no_email, "/login?error=sso_account_not_found", "no_email → redirect /login?error=sso_account_not_found");

  console.log("\n[2] DB-backed (real seeded DB, same lookup shape as the signIn callback)");
  await seedSso();

  // The exact lookup the signIn callback performs: findFirst by email then active gate.
  const dbLookup = async (email: string) => {
    const u = await prisma.user.findFirst({ where: { email }, select: { id: true, role: true, active: true } });
    return u ? { id: u.id, role: u.role, active: u.active } : null;
  };

  const known = await resolveEntraSignIn("sso.active@shell.test", dbLookup);
  assertTrue(known.ok === true, "DB: known ACTIVE email (sso.active) → allow");

  const notFound = await resolveEntraSignIn("nobody@shell.test", dbLookup);
  assertTrue(!notFound.ok && notFound.reason === "unknown", "DB: unknown email → denied (unknown)");

  const inact = await resolveEntraSignIn("sso.inactive@shell.test", dbLookup);
  assertTrue(!inact.ok && inact.reason === "inactive", "DB: INACTIVE user → denied (inactive)");

  // NO AUTO-PROVISION: deny must not create a user. Confirm zero rows for the
  // unknown email after the denied decision, and that the known user's row is
  // unchanged (still active, same id — a login attempt never mutates it).
  const stale = await prisma.user.count({ where: { email: "nobody@shell.test" } });
  assertEq(stale, 0, "DB: denied unknown email → NO account auto-provisioned (count=0)");
  const activeRow = await prisma.user.findFirst({ where: { email: "sso.active@shell.test" }, select: { id: true, active: true } });
  assertTrue(!!activeRow && activeRow.id === SSO_IDS.active && activeRow.active === true, "DB: known user row intact (not created/mutated by SSO)");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("SAMS-012 SSO unit test errored:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
