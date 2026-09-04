// SAMS-012 SSO + force-password-change — FUNCTIONAL (HTTP) test runner.
// Run against a built server (npm start, PORT=3330) pointed at a throwaway DB
// seeded with scripts/sso/run_seed.ts. Covers the owner test-plan FUNCTION items:
//   (a) force-change: flagged user → credentials login → forced to /change-password
//       → wrong current → 400 → correct change → flag cleared → portal accessible;
//       direct-URL bypass → redirected back.
//   (c) credentials login unchanged for non-SSO users (admin recovery verified).
//   (SSO button on /login; the SSO signIn-callback LOGIC is proven at unit level in
//    unit_sso.test.mts — the live IdP round-trip is landing-gated on Edward's Entra
//    registration, which is not yet in env.)
//
// Because the force-change flag lives in the JWT (stateless), the test proves
// "flag cleared → portal accessible" by re-authenticating with the NEW password
// (a fresh token has mustChangePassword=false). The session-refresh via
// useSession().update() is exercised in ui_drive_test.mjs.
const BASE = process.env.BASE_URL ?? "http://localhost:3330";

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

async function login(username, password) {
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

async function main() {
  console.log(`\n=== SAMS-012 SSO + force-password-change functional test against ${BASE} ===`);

  console.log("\n[1] Logins");
  const force = await login("sso_force", "Temp1234!");
  assertTrue(force.ok, "sso_force (flagged) logged in via credentials");
  assertTrue(force.session?.user?.mustChangePassword === true, "sso_force session carries mustChangePassword=true");

  const admin = await login("sso_admin", "Admin1234!");
  assertTrue(admin.ok, "sso_admin logged in via credentials");
  assertTrue(admin.session?.user?.role === "Admin", "sso_admin session role = Admin");
  assertTrue(admin.session?.user?.mustChangePassword === false, "sso_admin session mustChangePassword=false");

  console.log("\n[2] (a) force-change — /change-password gate + direct-URL bypass");
  const cpPage = await fetchWithManual(`${BASE}/change-password`, { method: "GET" }, force.jar);
  assertEq(cpPage.status, 200, "flagged user → GET /change-password loads (200)");

  // Direct-URL bypass → redirected back to /change-password (NOT served).
  const bypass = await fetchWithManual(`${BASE}/`, { method: "GET" }, force.jar);
  const loc = bypass.headers.get("location") || "";
  assertTrue(
    bypass.status === 307 || bypass.status === 302,
    `flagged user GET / → redirect (status ${bypass.status})`
  );
  assertTrue(loc.includes("/change-password"), `direct-URL bypass → redirected back to /change-password (Location=${loc})`);

  console.log("\n[3] (a) force-change — wrong current → 400");
  const wrongCurrent = await fetchWithManual(`${BASE}/api/auth/change-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "WrongPass999!", newPassword: "BrandNew12345!", confirmPassword: "BrandNew12345!" }),
  }, force.jar);
  assertEq(wrongCurrent.status, 400, "wrong current password → 400");

  console.log("\n[4] (a) force-change — new too short / mismatch → 400");
  const shortPw = await fetchWithManual(`${BASE}/api/auth/change-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "Temp1234!", newPassword: "short", confirmPassword: "short" }),
  }, force.jar);
  assertEq(shortPw.status, 400, "new password <10 chars → 400");
  const mismatch = await fetchWithManual(`${BASE}/api/auth/change-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "Temp1234!", newPassword: "BrandNew12345!", confirmPassword: "Different1234!" }),
  }, force.jar);
  assertEq(mismatch.status, 400, "new != confirm → 400");

  console.log("\n[5] (a) force-change — correct change → 200, flag cleared in DB");
  const correct = await fetchWithManual(`${BASE}/api/auth/change-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "Temp1234!", newPassword: "BrandNew12345!", confirmPassword: "BrandNew12345!" }),
  }, force.jar);
  assertEq(correct.status, 200, "correct current + valid new → 200");

  console.log("\n[6] (a) portal accessible after change (re-auth with new password)");
  // The old JWT still carries the flag (stateless) — a fresh login with the new
  // password proves the DB flag is cleared (no force-change redirect).
  const force2 = await login("sso_force", "BrandNew12345!");
  assertTrue(force2.ok, "sso_force re-login with NEW password OK");
  assertTrue(force2.session?.user?.mustChangePassword === false, "re-login session mustChangePassword=false (flag cleared)");
  const portal = await fetch(`${BASE}/`, { headers: { cookie: force2.jar.header() }, redirect: "follow" });
  assertEq(portal.status, 200, "GET / after change → 200 (portal accessible, not forced back)");
  assertTrue(!portal.url.includes("/change-password"), `final URL is not /change-password (${portal.url})`);

  console.log("\n[7] SSO button on /login");
  const loginPage = await fetch(`${BASE}/login`);
  const html = await loginPage.text();
  assertTrue(html.includes("Sign in with Microsoft"), "/login renders 'Sign in with Microsoft' button");

  console.log("\n[8] (c) credentials login unchanged — admin recovery path");
  const adminBrowse = await fetch(`${BASE}/admin`, { headers: { cookie: admin.jar.header() }, redirect: "follow" });
  assertEq(adminBrowse.status, 200, "sso_admin GET /admin → 200 (admin recovery verified)");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-012 functional test errored:", e); process.exitCode = 1; });
