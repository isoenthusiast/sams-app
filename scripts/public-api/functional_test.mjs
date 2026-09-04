// SAMS-011 public read-only API — FUNCTIONAL (HTTP) test runner.
// Run against a built server (npm start, PORT=<free>) pointed at a throwaway DB
// seeded with scripts/public-api/seed.ts (npx tsx scripts/public-api/seed.ts --run).
//
// Covers the owner-written test plan (a)–(e) over real HTTP (curl-equivalent):
//   (a) create key → all three public endpoints return correct company-scoped
//       JSON; lastUsedAt bumps.
//   (b) CROSS-TENANT SCAN: a company-A key's responses contain ZERO company-B
//       identifiers (proven with the distinctive PUB001/PUB002 markers).
//   (c) revoked key → 403; wrong key → 401; missing header → 401.
//   (d) list endpoint shows label/dates only — ZERO key material (scan).
//   (e) the client-data export ZIP contains no ApiKey rows / no key material.
// The DB-level (f) plaintext-never-stored proof lives in verify_step.ts.
const BASE = process.env.BASE_URL ?? "http://localhost:3321";

let failures = 0, checks = 0;
function ok(m) { checks++; console.log("  ✓ " + m); }
function fail(m) { checks++; failures++; console.error("  ✗ FAIL: " + m); }
function assertTrue(cond, m) { if (cond) ok(m); else fail(m); }
function assertEq(a, b, m) { if (a === b) ok(`${m} (= ${b})`); else fail(`${m}: expected ${b}, got ${a}`); }

const A = "cmp_pa_a";            // PUB001 Public Alpha
const B = "cmp_pa_b";            // PUB002 Public Beta
const A_KEYS = { PUB002: "PUB002", B_NAME: "Public Beta", B_FINDING: "BETA-ONLY-FINDING", B_PA: "Beta Process", B_FIND_ID: "FID-PA-B01", B_ACTION: "ACT-BETA-1", B_REQ: "REQ-BETA-01", B_STD: "ISO-PA-BETA" };
const A_MARKERS = { PUB001: "PUB001", A_FINDING: "ALPHA-ONLY-FINDING", A_FIND_ID: "FID-PA-A01" };

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
  await fetchWithManual(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }, jar);
  const session = await fetchWithManual(`${BASE}/api/auth/session`, { method: "GET" }, jar);
  const sess = await session.json().catch(() => ({}));
  return { ok: !!(sess?.user), jar, session: sess };
}

async function jpost(jar, url, body) {
  const res = await fetchWithManual(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, jar);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function jdel(jar, url) {
  const res = await fetchWithManual(url, { method: "DELETE" }, jar);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function jget(jar, url) {
  const res = await fetchWithManual(url, { method: "GET" }, jar);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function pubGet(path, token) {
  const headers = token === undefined ? {} : { Authorization: `Bearer ${token}` };
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, text, json };
}

async function main() {
  console.log(`\n=== SAMS-011 public API functional test against ${BASE} ===`);

  console.log("\n[1] Logins");
  const adminA = await login("pa_admin_a");
  const adminB = await login("pa_admin_b");
  assertTrue(adminA.ok, "adminA (client Admin A) logged in");
  assertTrue(adminB.ok, "adminB (client Admin B) logged in");

  console.log("\n[2] Cross-tenant create: Admin A cannot create a key for company B (403)");
  const cross = await jpost(adminA.jar, `${BASE}/api/admin/api-keys`, { companyId: B, label: "should fail" });
  assertEq(cross.status, 403, "Admin A creating a key for company B → 403");

  console.log("\n[3] (a) create key A (client Admin, own company)");
  const kA = await jpost(adminA.jar, `${BASE}/api/admin/api-keys`, { label: "Alpha dashboard sync" });
  assertEq(kA.status, 201, "create key A → 201");
  assertTrue(typeof kA.json.key === "string" && kA.json.key.startsWith("sams_pub_"), "create returns plaintext bearer (shown once)");
  assertTrue(!("keyHash" in kA.json), "create response has NO keyHash");
  const keyA = kA.json.key;

  console.log("\n[4] (a) call all three public endpoints with key A → correct A-scoped JSON");
  const soc = await pubGet("/api/public/v1/soc", keyA);
  assertEq(soc.status, 200, "soc → 200");
  const socJson = soc.json;
  assertTrue(socJson.company?.companyID === "PUB001" && socJson.company?.companyName === "Public Alpha", "soc → company A (PUB001 Public Alpha)");
  assertTrue(socJson.soc.total === 1 && socJson.soc.fullyComply === 1 && socJson.soc.coveragePct === 100, `soc → A coverage (total=1 fully=1 coveragePct=100), got ${JSON.stringify(socJson.soc)}`);

  const findings = await pubGet("/api/public/v1/findings", keyA);
  assertEq(findings.status, 200, "findings → 200");
  assertTrue(Array.isArray(findings.json.findings), "findings → array");
  const fIds = findings.json.findings.map((f) => f.id);
  assertTrue(fIds.includes(A_MARKERS.A_FIND_ID), "findings → A's finding present");
  assertTrue(findings.json.findings.some((f) => f.description.includes("ALPHA-ONLY-FINDING")), "findings → A's marker present");

  const actions = await pubGet("/api/public/v1/actions", keyA);
  assertEq(actions.status, 200, "actions → 200");
  const actIds = actions.json.actions.map((a) => a.id);
  assertTrue(actIds.includes("act_pa_a1") && actIds.includes("act_pa_a2"), "actions → A's two actions present");

  console.log("\n[5] actions?overdue=true → only the overdue action");
  const overdue = await pubGet("/api/public/v1/actions?overdue=true", keyA);
  assertEq(overdue.status, 200, "actions?overdue=true → 200");
  const overdueIds = overdue.json.actions.map((a) => a.id);
  assertTrue(overdueIds.length === 1 && overdueIds.includes("act_pa_a2"), `overdue → only act_pa_a2 (got ${JSON.stringify(overdueIds)})`);
  assertTrue(overdue.json.actions[0].overdue === true, "overdue action flagged overdue=true");

  console.log("\n[6] (a) lastUsedAt bumps after use");
  const listA = await jget(adminA.jar, `${BASE}/api/admin/api-keys?companyId=${A}`);
  const keyRow = listA.json.keys.find((k) => k.id === kA.json.keyId);
  assertTrue(!!keyRow && !!keyRow.lastUsedAt, `lastUsedAt bumped (${keyRow?.lastUsedAt})`);

  console.log("\n[7] (b) CROSS-TENANT SCAN — key A responses contain ZERO company-B identifiers");
  const bSubstrs = Object.values(A_KEYS);
  const aBodies = [soc.text, findings.text, actions.text, overdue.text];
  let leaked = [];
  for (const body of aBodies) {
    for (const sub of bSubstrs) {
      if (body.includes(sub)) leaked.push(sub);
    }
  }
  assertEq(leaked.length, 0, `key A responses have ZERO company-B identifiers (${leaked.length} found)`);
  if (leaked.length) { fail("leaked: " + leaked.join(", ")); }
  assertTrue(aBodies.every((b) => b.includes("PUB001")), "key A responses DO carry company-A identifier PUB001");

  console.log("\n[8] (c) revoked key → 403; wrong key → 401; missing header → 401");
  const kRevoke = await jpost(adminA.jar, `${BASE}/api/admin/api-keys`, { label: "revoke me" });
  const revokedKey = kRevoke.json.key;
  const revokeRes = await jdel(adminA.jar, `${BASE}/api/admin/api-keys/${kRevoke.json.keyId}`);
  assertTrue(revokeRes.status === 200 && revokeRes.json.revoked === true, "revoke → 200 revoked");
  const afterRevoke = await pubGet("/api/public/v1/soc", revokedKey);
  assertEq(afterRevoke.status, 403, "revoked key → 403");
  const wrong = await pubGet("/api/public/v1/soc", "sams_pub_totally-bogus-key");
  assertEq(wrong.status, 401, "wrong key → 401");
  const missing = await pubGet("/api/public/v1/soc", undefined);
  assertEq(missing.status, 401, "missing header → 401");
  // revoked key is revoked (not deleted) — verify list still shows it but revoked.
  const listAfterRevoke = await jget(adminA.jar, `${BASE}/api/admin/api-keys?companyId=${A}`);
  const revokedRow = listAfterRevoke.json.keys.find((k) => k.id === kRevoke.json.keyId);
  assertTrue(!!revokedRow && !!revokedRow.revokedAt, "revoked key still listed with revokedAt set");

  console.log("\n[9] (d) list endpoint shows label/dates only — ZERO key material");
  const listText = JSON.stringify(listA.json);
  assertTrue(!listText.includes(keyA), "list response does NOT contain the plaintext key");
  assertTrue(!/keyHash|password|sams_pub_[A-Za-z0-9_-]{30,}/i.test(listText), "list response has no key material (keyHash/secret-like string)");
  assertTrue(listRowHasOnlyMeta(listA.json.keys), "list keys are label/dates/creator only (whitelist shape)");

  console.log("\n[10] (e) export ZIP contains no ApiKey rows / no key material");
  const exp = await fetchWithManual(`${BASE}/api/admin/companies/${A}/export`, { method: "GET" }, adminA.jar);
  assertEq(exp.status, 200, "export → 200");
  const zipBuf = Buffer.from(await exp.arrayBuffer());
  const zipText = zipBuf.toString("utf8");
  // BuildExportPackage only catalogs EXPORT_TABLES; ApiKey is deliberately absent.
  // The manifest.exclusionList legitimately carries the column-level "apiKey"
  // marker (belt-and-braces, asserted by verify_step.ts), so the bare substring
  // /ApiKey/i would false-positive on that marker. Assert the REAL property the
  // DoD wants — no ApiKey TABLE / FILE is exported — by anchoring on the table
  // ("model":"ApiKey") and file ("apiKey.csv") shapes, not the bare word.
  assertTrue(!/model"\s*:\s*"ApiKey"/i.test(zipText) && !/apiKey\.csv/i.test(zipText), "export ZIP lists no ApiKey table/file (exclusionList 'apiKey' marker is expected)");
  assertTrue(!zipText.includes(keyA), "export ZIP does not contain the plaintext key");
  assertTrue(!/keyHash/i.test(zipText), "export ZIP has no keyHash column");
  // manifest (stored uncompressed) is visible — confirm the known CSVs are there.
  assertTrue(zipText.includes("manifest.json"), "export ZIP has a manifest.json");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) { console.error("SAMS-011 FUNCTIONAL TEST FAILED."); process.exitCode = 1; }
  else { console.log("SAMS-011 FUNCTIONAL TEST PASSED."); }
}

function listRowHasOnlyMeta(rows) {
  const allowedTop = new Set(["id", "label", "createdAt", "lastUsedAt", "revokedAt", "createdBy"]);
  return (rows || []).every((k) => Object.keys(k).every((key) => allowedTop.has(key)));
}

main().catch((e) => { console.error("SAMS-011 functional test errored:", e); process.exitCode = 1; });
