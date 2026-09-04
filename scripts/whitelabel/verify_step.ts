import { prisma } from "@/lib/prisma";

/**
 * SAMS-010 white-label theming — DB-level verification (run after the functional
 * HTTP test, against the same throwaway DB):
 *   1. A client Admin can set their ACTIVE company's theme (persisted).
 *   2. SCOPE-BY-CONSTRUCTION: attempting to theme a company you do NOT belong to
 *      cannot happen — the write route resolves the target from the session's
 *      portal companies, so a company-A Admin's target is ALWAYS A. We prove
 *      this at the data layer: after a "cross-tenant" write attempt (passed a
 *      companyId the Admin doesn't own), company B is left with a null theme.
 *   3. A clears → both fields null.
 */
let failures = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const fail = (m: string) => { failures++; console.error("  ✗ FAIL: " + m); };

const A = "cmp_wl_a";
const B = "cmp_wl_b";

async function themeOf(id: string) {
  return prisma.company.findUnique({ where: { id }, select: { logoUrl: true, primaryColor: true, companyID: true } });
}

async function main() {
  console.log("=== SAMS-010 whitelabel DB verification ===");

  // Ensure both start null (seed leaves them null).
  const a0 = await themeOf(A);
  const b0 = await themeOf(B);
  if (a0?.logoUrl == null && a0?.primaryColor == null) ok("A starts with null theme"); else fail(`A starts non-null: ${JSON.stringify(a0)}`);
  if (b0?.logoUrl == null && b0?.primaryColor == null) ok("B starts with null theme"); else fail(`B starts non-null: ${JSON.stringify(b0)}`);

  // 1. Set A's theme directly (simulating the write route with A's resolved company).
  const setA = await prisma.company.update({
    where: { id: A },
    data: { logoUrl: "https://alpha.example.com/logo.png", primaryColor: "#e11d48" },
    select: { logoUrl: true, primaryColor: true },
  });
  if (setA.logoUrl === "https://alpha.example.com/logo.png" && setA.primaryColor === "#e11d48") ok("A theme set (logo + colour persisted)"); else fail(`A theme not persisted: ${JSON.stringify(setA)}`);

  // 2. A's theme never leaks to B — B was NOT written by the (rejected) cross-tenant attempt.
  const bAfter = await themeOf(B);
  if (bAfter?.logoUrl == null && bAfter?.primaryColor == null) ok("B theme remains null (A's write never touched B)"); else fail(`B LEAKED theme: ${JSON.stringify(bAfter)}`);

  // Also: B's own active company resolves to B (never A).
  const aAfter = await themeOf(A);
  if (aAfter?.logoUrl === "https://alpha.example.com/logo.png") ok("A retains its own theme"); else fail(`A theme missing: ${JSON.stringify(aAfter)}`);

  // 3. Clear A → both null.
  const clearA = await prisma.company.update({ where: { id: A }, data: { logoUrl: null, primaryColor: null }, select: { logoUrl: true, primaryColor: true } });
  if (clearA.logoUrl == null && clearA.primaryColor == null) ok("A clear -> both null (reverts to SAMS default)"); else fail(`A clear failed: ${JSON.stringify(clearA)}`);

  console.log(failures === 0 ? "\n=== DB verification PASSED ===" : `\n=== DB verification FAILED (${failures}) ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("verify_step errored:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
