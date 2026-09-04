// SAMS-010 white-label theming — FUNCTIONAL (HTTP) test runner.
// Run against a built server (npm start, PORT=<free>) pointed at a throwaway DB
// seeded with scripts/whitelabel/seed.ts. Covers the owner test-plan FUNCTION
// items (a)(b)(c):
//   (a) invalid hex → 422; non-https logo URL → 422.
//   (b) settings save requires client Admin (other roles → 403).
//   (c) theme of company A never leaks into company B's portal
//       (scope-by-construction).
//
// Note: the portal header is client-hydrated, so the server-rendered HTML does
// NOT contain the resolved logo/colour. The (d)(e)(f) UI assertions live in
// ui_drive_test.mjs (Playwright). The DB-level scope proof (that A's writes never
// touch B) is in verify_step.ts — split here so HTTP assertions stay pure.
const BASE = process.env.BASE_URL ?? "http://localhost:3320";

let failures = 0, checks = 0;
function ok(m) { checks++; console.log("  ✓ " + m); }
function fail(m) { checks++; failures++; console.error("  ✗ FAIL: " + m); }
function assertTrue(cond, m) { if (cond) ok(m); else fail(m); }
function assertEq(a, b, m) { if (a === b) ok(`${m} (= ${b})`); else fail(`${m}: expected ${b}, got ${a}`); }

class Jar {
  constructor() { this.map = new Map(); }
  set(setCookie) {
    if (!setCookie) return;
    const s = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of s) {
      const pair = c.split(";")[0].split("=");
      if (pair.length >= 2) this.map.set(pair[0].trim(), decodeURIComponent(pair.slice(1).join("=")));
    }
  }
  header() { return [...this.map].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "); }
}

async function fetchWithManual(url, opts = {}, jar) {
  const headers = new Headers(opts.headers || {});
  if (jar) headers.set("cookie", jar.header());
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  if (jar && res.headers.getSetCookie) jar.set(res.headers.getSetCookie());
  return res;
}

async function login(username, password = "Test1234!") {
  const jar = new Jar();
  const csrfRes = await fetchWithManual(`${BASE}/api/auth/csrf`, { method: "GET" }, jar);
  const csrf = (await csrfRes.json().catch(() => ({})))?.csrfToken;
  if (!csrf) return { ok: false, jar, reason: "no csrf" };
  const body = new URLSearchParams({ csrfToken: csrf, username, password, json: "true" });
  await fetchWithManual(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  }, jar);
  const session = await fetchWithManual(`${BASE}/api/auth/session`, { method: "GET" }, jar);
  const sess = await session.json().catch(() => ({}));
  return { ok: !!(sess?.user), jar, session: sess, username };
}

const B = "cmp_wl_b";
const ADMIN_A = "wl_admin_a";
const ADMIN_B = "wl_admin_b";
const ASSESSOR_A = "wl_ass_a";
const THEME_URL = `${BASE}/api/portal/company/theme`;

async function main() {
  console.log(`\n=== SAMS-010 white-label functional test against ${BASE} ===`);

  console.log("\n[1] Logins");
  const adminA = await login(ADMIN_A);
  const adminB = await login(ADMIN_B);
  const assessorA = await login(ASSESSOR_A);
  assertTrue(adminA.ok, "adminA (client Admin A) logged in");
  assertTrue(adminB.ok, "adminB (client Admin B) logged in");
  assertTrue(assessorA.ok, "assessorA (client Assessor A) logged in");

  console.log("\n[2] (a) Validation — invalid inputs → 422");
  const cases = [
    { body: { primaryColor: "blue" }, m: "invalid primaryColor ('blue')" },
    { body: { primaryColor: "#12" }, m: "invalid primaryColor ('#12')" },
    { body: { primaryColor: "#12345" }, m: "invalid primaryColor ('#12345', 5 digits)" },
    { body: { primaryColor: "#1234567" }, m: "invalid primaryColor ('#1234567', 7 digits)" },
    { body: { logoUrl: "http://evil.example.com/logo.png" }, m: "non-https logoUrl ('http://...')" },
    { body: { logoUrl: "javascript:alert(1)" }, m: "javascript: logoUrl" },
    { body: { logoUrl: "ftp://x.com/logo.png" }, m: "ftp logoUrl" },
  ];
  for (const c of cases) {
    const res = await fetchWithManual(THEME_URL, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c.body),
    }, adminA.jar);
    assertEq(res.status, 422, `${c.m} -> 422`);
  }

  console.log("\n[3] (b) Client-Admin gate — other roles → 403");
  const assessorTry = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryColor: "#ff0000" }),
  }, assessorA.jar);
  assertEq(assessorTry.status, 403, "client Assessor A sets theme -> 403");

  // Unauthenticated → the middleware redirects to /login (307) — the app's real
  // authz guard. The request can never reach the write route.
  const noAuth = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryColor: "#ff0000" }),
  });
  assertTrue(noAuth.status === 307 || noAuth.status === 401 || noAuth.status === 302, `unauthenticated write gated (status ${noAuth.status})`);

  console.log("\n[4] (c) Scope-by-construction — no cross-tenant write");
  // Admin A sets A's theme.
  const setA = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logoUrl: "https://alpha.example.com/logo.png", primaryColor: "#e11d48" }),
  }, adminA.jar);
  assertEq(setA.status, 200, "adminA sets A's theme (200)");
  const setAJson = await setA.json().catch(() => ({}));
  assertEq(setAJson.company?.companyID, "WL001", "A's theme written to WL001");
  assertEq(setAJson.company?.primaryColor, "#e11d48", "A's primaryColor persisted");
  assertEq(setAJson.company?.logoUrl, "https://alpha.example.com/logo.png", "A's logoUrl persisted");

  // Cross-tenant: Admin A tries to theme company B via ?companyId=B. Because A
  // belongs ONLY to company A, resolvePortalCompanyId (single-company) resolves
  // to A regardless of the param — so the write lands on A, never B. Prove it by
  // examining WHICH company the server wrote to (the response echoes it).
  const crossTenant = await fetchWithManual(`${THEME_URL}?companyId=${B}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryColor: "#0000ff" }),
  }, adminA.jar);
  assertEq(crossTenant.status, 200, "cross-tenant attempt still 200 (writes to A's active company only)");
  const crossJson = await crossTenant.json().catch(() => ({}));
  assertEq(crossJson.company?.companyID, "WL001", "cross-tenant attempt wrote to WL001 (NOT WL002) — scope-by-construction");
  assertEq(crossJson.company?.id, "cmp_wl_a", "target company remains A (never a client-supplied B)");

  // Positive: Admin B can set B's theme independently.
  const setB = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryColor: "#0ea5e9" }),
  }, adminB.jar);
  assertEq(setB.status, 200, "adminB sets B's theme (200)");
  const setBJson = await setB.json().catch(() => ({}));
  assertEq(setBJson.company?.companyID, "WL002", "B's theme written to WL002");
  assertEq(setBJson.company?.primaryColor, "#0ea5e9", "B's primaryColor persisted");

  console.log("\n[5] Clear reverts to SAMS default");
  // Clear A.
  const clearA = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  }, adminA.jar);
  assertEq(clearA.status, 200, "adminA clears A's theme (200)");
  const clearAJson = await clearA.json().catch(() => ({}));
  assertEq(clearAJson.company?.primaryColor, null, "A clear -> primaryColor null");
  assertEq(clearAJson.company?.logoUrl, null, "A clear -> logoUrl null");
  // Clear B (leave B untouched afterwards for the verify_step legacy check).
  const clearB = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  }, adminB.jar);
  assertEq(clearB.status, 200, "adminB clears B's theme (200)");

  console.log("\n[6] Partial-update preservation (Conan round-1 finding #2)");
  // A is null at this point ([5] cleared it). Set a full theme first.
  const setFullA = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logoUrl: "https://alpha.example.com/logo.png", primaryColor: "#e11d48" }),
  }, adminA.jar);
  assertEq(setFullA.status, 200, "set A's full theme (200)");

  // PATCH {primaryColor:...} (logoUrl OMITTED) → logoUrl MUST be preserved.
  const partialColor = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryColor: "#00ff00" }),
  }, adminA.jar);
  assertEq(partialColor.status, 200, "partial (primaryColor only) → 200");
  const pcJson = await partialColor.json().catch(() => ({}));
  assertEq(pcJson.company?.logoUrl, "https://alpha.example.com/logo.png", "partial update PRESERVED the existing logoUrl");
  assertEq(pcJson.company?.primaryColor, "#00ff00", "partial update updated primaryColor");

  // PATCH {logoUrl:null} → clears ONLY logoUrl; primaryColor preserved.
  const clearLogo = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logoUrl: null }),
  }, adminA.jar);
  assertEq(clearLogo.status, 200, "clear logo via null → 200");
  const clJson = await clearLogo.json().catch(() => ({}));
  assertEq(clJson.company?.logoUrl, null, "explicit null cleared logoUrl");
  assertEq(clJson.company?.primaryColor, "#00ff00", "partial preserve kept primaryColor");

  // PATCH {primaryColor:""} → clears ONLY primaryColor.
  const clearColor = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryColor: "" }),
  }, adminA.jar);
  assertEq(clearColor.status, 200, "clear colour via '' → 200");
  const ccJson = await clearColor.json().catch(() => ({}));
  assertEq(ccJson.company?.primaryColor, null, "'' cleared primaryColor");
  assertEq(ccJson.company?.logoUrl, null, "logoUrl already null");

  // Empty PATCH body ({}) → no-op; nothing cleared, existing theme preserved.
  const setFullA2 = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logoUrl: "https://alpha.example.com/logo.png", primaryColor: "#e11d48" }),
  }, adminA.jar);
  assertEq(setFullA2.status, 200, "re-set A's full theme (200)");
  const noop = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }, adminA.jar);
  assertEq(noop.status, 200, "empty PATCH body {} → 200 (no-op)");
  const noopJson = await noop.json().catch(() => ({}));
  assertEq(noopJson.company?.logoUrl, "https://alpha.example.com/logo.png", "empty body {} did NOT wipe logoUrl");
  assertEq(noopJson.company?.primaryColor, "#e11d48", "empty body {} did NOT wipe primaryColor");

  // Restore for the verify_step / UI legacy checks.
  const clearAFinal = await fetchWithManual(THEME_URL, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  }, adminA.jar);
  assertEq(clearAFinal.status, 200, "clear A before handoff (200)");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-010 functional test errored:", e); process.exitCode = 1; });
