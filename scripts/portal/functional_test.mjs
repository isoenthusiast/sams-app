// Client Portal (SAMS-005) — FUNCTIONAL (HTTP) test runner.
// Run against a built server (npm start) on port 3200 pointed at a throwaway DB
// seeded with scripts/portal/seed.ts. Covers A4/A6 acceptance criteria:
// landing redirect, SOC dashboard, management response (save / 403 / 422 /
// cross-tenant), cross-tenant portal scans, provider-Internal-content scan,
// request deep-link, and the no-company empty state.
//
// DB-level verification (hand-SQL count match + persisted stamps) is in
// scripts/portal/verify_step.ts.

const BASE = process.env.BASE_URL ?? "http://localhost:3200";

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

async function html(url, jar) {
  const res = await fetchWithManual(url, { method: "GET" }, jar);
  const text = await res.text().catch(() => "");
  return { res, text };
}

const FINDING_A = "FID-PF-A01";
const FINDING_A2 = "FID-PF-A02";
const FINDING_B = "FID-PF-B01";
const CLIENT_A = "pf_client_a";
const INTERVIEWEE_A = "pf_interviewee_a";
const CLIENT_B = "pf_client_b";
const NO_COMPANY = "pf_nocompany";
const PROVIDER = "pf_provider";
// SAMS-005 review r1 regression fixtures.
const ADMIN_B = "pf_admin_b"; // role=Admin, UserCompany mapping ONLY to company B
const DIRECT_A = "pf_direct_a"; // role=Assessor, companyId=A ONLY (no mapping)

// Company-A identifiers that must NEVER appear in a company-B portal response,
// and the provider-Internal note that must NEVER appear in ANY portal response.
const A_MARKERS = ["PF Gap A", "FID-PF-A01", "Portal Alpha", "PFA-REQ-A", "PF A risk"];
const B_MARKERS = ["PF Gap B", "FID-PF-B01", "Portal Beta", "PFB-REQ-B", "PF B risk"];
const INTERNAL_NOTE = "PF A INTERNAL-ONLY note";

async function main() {
  console.log(`\n=== Client Portal functional test against ${BASE} ===`);

  console.log("\n[0] Unauthenticated guard");
  const noAuth = await fetchWithManual(`${BASE}/portal`, { method: "GET" });
  assertTrue(noAuth.status === 307 || noAuth.status === 302 || noAuth.status === 401, `GET /portal unauthenticated gated (${noAuth.status})`);

  console.log("\n[1] Logins");
  const provider = await login(PROVIDER);
  const clientA = await login(CLIENT_A);
  const intervieweeA = await login(INTERVIEWEE_A);
  const clientB = await login(CLIENT_B);
  const noCompany = await login(NO_COMPANY);
  const adminB = await login(ADMIN_B);
  const directA = await login(DIRECT_A);
  assertTrue(provider.ok, "provider logged in");
  assertTrue(clientA.ok, "clientA (Assessor A) logged in");
  assertTrue(intervieweeA.ok, "intervieweeA logged in");
  assertTrue(clientB.ok, "clientB (Assessor B) logged in");
  assertTrue(noCompany.ok, "no-company user logged in");
  assertTrue(adminB.ok, "adminB (Admin, mapping only to B) logged in");
  assertTrue(directA.ok, "directA (Assessor, companyId=A only) logged in");

  console.log("\n[2] Landing rule (A6 a, settled #6)");
  // App Router encodes redirect() as an RSC NEXT_REDIRECT digest (the browser
  // router follows it — verified in the UI test). Assert the digest target.
  const provRoot = await fetchWithManual(`${BASE}/`, { method: "GET" }, provider.jar);
  const provBody = await provRoot.text();
  assertTrue(provBody.includes("NEXT_REDIRECT") && provBody.includes("/fla") && !provBody.includes("/portal"),
    `provider landing digest targets /fla (providerRole set)`);
  const caRoot = await fetchWithManual(`${BASE}/`, { method: "GET" }, clientA.jar);
  const caBody = await caRoot.text();
  assertTrue(caBody.includes("NEXT_REDIRECT") && caBody.includes("/portal"),
    `client landing digest targets /portal (no providerRole)`);
  const cbRoot = await fetchWithManual(`${BASE}/`, { method: "GET" }, clientB.jar);
  const cbBody = await cbRoot.text();
  assertTrue(cbBody.includes("NEXT_REDIRECT") && cbBody.includes("/portal"), `client B landing digest targets /portal`);

  console.log("\n[3] Dashboard (A6 a, #51 counts)");
  const dashA = await html(`${BASE}/portal`, clientA.jar);
  assertTrue(dashA.res.status === 200, `GET /portal clientA 200 (${dashA.res.status})`);
  assertTrue(dashA.text.includes("Portal Alpha"), "clientA dashboard shows company A name");
  assertTrue(dashA.text.includes("Portal PA A"), "clientA dashboard shows its process area");
  assertTrue(dashA.text.includes("100%"), "clientA dashboard reflects 1/1 FullyComply -> 100%");
  const dashB = await html(`${BASE}/portal`, clientB.jar);
  assertTrue(dashB.text.includes("Portal Beta"), "clientB dashboard shows company B name");
  assertTrue(dashB.text.includes("PFB-REQ-B") === false ? true : false, "clientB dashboard leaks company code (scan)");

  console.log("\n[4] Cross-tenant probe (A6, zero A identifiers on B portal)");
  for (const url of [`${BASE}/portal`, `${BASE}/portal/findings`, `${BASE}/portal/activity`, `${BASE}/portal/actions`]) {
    const { text } = await html(url, clientB.jar);
    const leaked = A_MARKERS.filter((m) => text.includes(m));
    assertEq(leaked.length, 0, `B portal ${url.replace(BASE, "")} has ZERO A markers${leaked.length ? ` (${leaked.join(",")})` : ""}`);
  }

  console.log("\n[5] Provider-Internal content scan (A6, zero across portal)");
  for (const url of [`${BASE}/portal`, `${BASE}/portal/findings`, `${BASE}/portal/activity`]) {
    const { text } = await html(url, clientA.jar);
    assertTrue(!text.includes(INTERNAL_NOTE), `clientA ${url.replace(BASE, "")} has ZERO provider-Internal note${text.includes(INTERNAL_NOTE) ? " (LEAK)" : ""}`);
  }

  console.log("\n[6] Management response (A6 b)");
  const save = await fetchWithManual(`${BASE}/api/portal/findings/${FINDING_A}/management-response`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementResponse: "We acknowledge and will remediate by Q4." }),
  }, clientA.jar);
  assertEq(save.status, 200, "client Assessor saves response (200)");
  const saveJson = await save.json().catch(() => ({}));
  assertTrue(!!saveJson.finding?.managementResponseAt, "response stamped with managementResponseAt");
  assertTrue(!!saveJson.finding?.managementResponseById, "response stamped with managementResponseById");
  assertEq(saveJson.finding?.managementResponse, "We acknowledge and will remediate by Q4.", "response text persisted");

  const reload = await html(`${BASE}/portal/findings`, clientA.jar);
  assertTrue(reload.text.includes("We acknowledge and will remediate by Q4."), "response visible on findings reload (stamped text)");

  const intervieweeSave = await fetchWithManual(`${BASE}/api/portal/findings/${FINDING_A}/management-response`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementResponse: "interviewee attempt" }),
  }, intervieweeA.jar);
  assertEq(intervieweeSave.status, 403, "Interviewee save -> 403");

  const tooLong = await fetchWithManual(`${BASE}/api/portal/findings/${FINDING_A}/management-response`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementResponse: "x".repeat(2001) }),
  }, clientA.jar);
  assertEq(tooLong.status, 422, ">2000 char response -> 422");

  const crossTenantSave = await fetchWithManual(`${BASE}/api/portal/findings/${FINDING_A}/management-response`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementResponse: "B tries A" }),
  }, clientB.jar);
  assertEq(crossTenantSave.status, 403, "company-B user saving on company-A finding -> 403");

  console.log("\n[6b] Review r1 regression — same-root-cause tenant scoping on the write gate");
  // P1: a company-B Admin (role=Admin, mapping ONLY to B, NOT provider-plane) must
  // be 403 on a company-A finding — NO global Admin bypass on the portal write.
  const adminBTry = await fetchWithManual(`${BASE}/api/portal/findings/${FINDING_A}/management-response`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementResponse: "admin B hijacks A" }),
  }, adminB.jar);
  assertEq(adminBTry.status, 403, "company-B Admin (mapping only to B) on company-A finding -> 403 (no Admin bypass)");

  // P2: a client Assessor whose membership is User.companyId-only (no UserCompany
  // mapping) must be 200 on a finding of his OWN company — membership via
  // User.companyId. Uses a DEDICATED company-A finding (FID-PF-A02) so it does not
  // clobber the A01 response the DB-verify step asserts.
  const directASave = await fetchWithManual(`${BASE}/api/portal/findings/${FINDING_A2}/management-response`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementResponse: "Direct member A responds" }),
  }, directA.jar);
  assertEq(directASave.status, 200, "company-A Assessor with User.companyId only on own finding -> 200");
  const directAJson = await directASave.json().catch(() => ({}));
  assertTrue(!!directAJson.finding?.managementResponseById, "directA save stamped managementResponseById");
  assertEq(directAJson.finding?.managementResponse, "Direct member A responds", "directA save text persisted");

  console.log("\n[7] Request deep-link (A6 e)");
  const requestsA = await html(`${BASE}/portal/requests`, clientA.jar);
  assertTrue(requestsA.text.includes("Provide PF A sign-off"), "clientA sees their open evidence request");
  assertTrue(requestsA.text.includes('/fla/my-evidence-requests'), "request card deep-links to the fabric submit flow");
  const submitPage = await html(`${BASE}/fla/my-evidence-requests`, clientA.jar);
  assertTrue(submitPage.res.status === 200, "fabric submit flow reachable (200)");

  console.log("\n[8] No-company empty state (A6 f)");
  const empty = await html(`${BASE}/portal`, noCompany.jar);
  assertTrue(empty.res.status === 200, "no-company user portal returns 200");
  assertTrue(empty.text.includes("linked to a company"), "no-company user sees guided empty state");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("Portal functional test errored:", e); process.exitCode = 1; });
