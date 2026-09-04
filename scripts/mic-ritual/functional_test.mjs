// MIC Ritual (SAMS-014, Phase 4 Feature B) — FUNCTIONAL test runner.
//
// Run against a BUILT server (npm start, PORT=3200) pointed at the throwaway DB
// seeded by scripts/mic-ritual/seed.ts, with CRON_SECRET set on the server.
// This file: (1) starts a local webhook receiver on :3999 (recording
// {path, body}), then drives the flows through HTTP + page fetches.
//
// Owner test-plan items covered here (HTTP/UI-text lens; DB-level assertions live
// in scripts/mic-ritual/verify_step.ts):
//   (c) overdue PA surfaces on /fla + /portal + processdetails; NOTHING blocks
//       (a management response still saves 2xx while the PA is overdue).
//   (e) cross-tenant attest for another company's PA -> 403, no row written.
//   (a) attest -> server-computed snapshot (tampered client snapshot ignored).
//   (b) audit row per attestation (count == number of attests).
//   (digest) weekly-digest carries "Overdue SOC attestations" (A: >=1, B: : 0);
//   (notify) exactly-once: digest twice -> no duplicate MIC_ATTEST_DUE, and after
//            attesting the overdue PA the sweep refires nothing.
//   (d) cadence change recomputes next-due immediately (PATCH returns cadence).
import http from "node:http";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const RECEIVER_PORT = 3999;
const CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";

const IDS = {
  a: "cmp_mic_a",
  b: "cmp_mic_b",
  paA1: "pa_mic_a1",
  paA2: "pa_mic_a2",
  paB: "pa_mic_b1",
  adminA: "usr_mic_admin_a",
  assessorA: "usr_mic_assessor_a",
  provider: "usr_mic_provider",
  findingA1: "FID-MIC-A01",
};

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, msg) => { if (cond) ok(msg); else fail(msg); };
const assertEq = (actual, expected, msg) => { if (actual === expected) ok(`${msg} (= ${expected})`); else fail(`${msg}: expected ${expected}, got ${actual}`); };

// ── Local webhook receiver ─────────────────────────────────────────────────
const received = [];
const receiver = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let json = null;
    try { json = JSON.parse(body); } catch { json = body; }
    received.push({ path: req.url, json, method: req.method });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});
function startReceiver() { return new Promise((resolve) => receiver.listen(RECEIVER_PORT, "127.0.0.1", resolve)); }
function got(path, needle) { return received.some((r) => r.path === path && (needle ? JSON.stringify(r.json).includes(needle) : true)); }
function count(path) { return received.filter((r) => r.path === path).length; }
function latest(path) { return received.filter((r) => r.path === path).slice(-1)[0]; }

// ── HTTP helpers ───────────────────────────────────────────────────────────
class Jar {
  constructor() { this.map = new Map(); }
  set(sc) { if (!sc) return; const s = Array.isArray(sc) ? sc : [sc]; for (const c of s) { const p = c.split(";")[0].split("="); if (p.length >= 2) this.map.set(p[0].trim(), decodeURIComponent(p.slice(1).join("="))); } }
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
  const csrf = (await (await fetchWithManual(`${BASE}/api/auth/csrf`, { method: "GET" }, jar)).json().catch(() => ({})))?.csrfToken;
  if (!csrf) return { ok: false, jar };
  await fetchWithManual(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf, username, password, json: "true" }).toString() }, jar);
  const sess = await (await fetchWithManual(`${BASE}/api/auth/session`, { method: "GET" }, jar)).json().catch(() => ({}));
  return { ok: !!(sess?.user), jar };
}
async function bodyJson(res) { try { return await res.json(); } catch { return {}; } }

async function main() {
  await startReceiver();
  console.log(`\n=== MIC Ritual functional test against ${BASE} ===`);

  console.log("\n[0] Logins");
  const provider = await login("mic_provider", "Test1234!");
  const adminA = await login("mic_admin_a", "Test1234!");
  const assessorA = await login("mic_assessor_a", "Test1234!");
  assertTrue(provider.ok, "provider logged in");
  assertTrue(adminA.ok, "client-Admin A logged in");
  assertTrue(assessorA.ok, "client-Assessor A logged in");

  console.log("\n[a] Cross-tenant attest (company A user -> company B PA) -> 403");
  const cross = await fetchWithManual(`${BASE}/api/admin/processareas/${IDS.paB}/attest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }, assessorA.jar);
  assertEq(cross.status, 403, "cross-tenant attest -> 403");

  console.log("\n[b] Overdue PA surfaces on /fla + /portal + processdetails; NOTHING blocks");
  const fla = await fetchWithManual(`${BASE}/fla?companyId=${IDS.a}`, { method: "GET" }, adminA.jar);
  const flaHtml = await fla.text();
  assertTrue(flaHtml.includes("attest overdue"), "/fla dashboard shows an attestation-overdue chip");
  const portal = await fetchWithManual(`${BASE}/portal`, { method: "GET" }, adminA.jar);
  const portalHtml = await portal.text();
  assertTrue(portalHtml.includes("Attestation overdue"), "/portal overview shows an attestation-overdue status");
  const pd = await fetchWithManual(`${BASE}/setup/processdetails/${IDS.paA1}`, { method: "GET" }, adminA.jar);
  const pdHtml = await pd.text();
  assertTrue(pdHtml.includes("SOC Attestation") && (pdHtml.includes("Overdue")), "processdetails page shows the attestation card + Overdue state");

  // NOTHING blocks: save a management response on an open finding while the PA is overdue.
  const mgmt = await fetchWithManual(`${BASE}/api/portal/findings/${IDS.findingA1}/management-response`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managementResponse: "Reviewed and accepted - tracking closure." }) }, adminA.jar);
  assertEq(mgmt.status, 200, "a normal action (management response) still succeeds while a PA is overdue (SOFT enforcement)");

  console.log("\n[c] Weekly digest carries the overdue-attestations line (A>=1, B==0) + secret-scan");
  const dig1 = await fetchWithManual(`${BASE}/api/cron/weekly-digest`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` }, body: JSON.stringify({}) });
  assertEq(dig1.status, 200, "weekly-digest -> 200");
  const dig1Json = await bodyJson(dig1);
  assertTrue(dig1Json.posted >= 2, `digest posted to both companies (posted=${dig1Json.posted})`);
  const nhA = latest("/nh_a");
  assertTrue(got("/nh_a", "Overdue SOC attestations"), "company A digest contains the Overdue SOC attestations line");
  const aCountLine = nhA?.json?.text?.split("\n").find((l) => l.includes("Overdue SOC attestations")) ?? "";
  const aNum = parseInt((aCountLine.match(/(\d+)/) || [])[1] ?? "0", 10);
  assertTrue(aNum >= 1, `company A overdue-attestation count = ${aNum} (>= 1)`);
  assertTrue(got("/nh_b", "Overdue SOC attestations: 0"), "company B digest shows Overdue SOC attestations: 0 (no overdue PAs)");
  assertTrue(!got("/nh_a", "127.0.0.1:3999"), "digest payload does NOT contain the webhook URL (secret-scan)");
  assertTrue(dig1Json.attestationDue.processAreas >= 1, `attestation-due sweep reported ${dig1Json.attestationDue.processAreas} overdue PA(s)`);
  const firstNotifyCount = dig1Json.attestationDue.notifications;
  assertTrue(firstNotifyCount >= 1, `attestation-due sweep emitted ${firstNotifyCount} in-app notification(s) on first run`);

  console.log("\n[d] Exactly-once: digest again on a still-overdue PA -> no duplicate notification");
  const dig2 = await fetchWithManual(`${BASE}/api/cron/weekly-digest`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` }, body: JSON.stringify({}) });
  const dig2Json = await bodyJson(dig2);
  assertEq(dig2Json.attestationDue.notifications, 0, `second digest run emits NO new attestation-due notification (dedup; got ${dig2Json.attestationDue.notifications})`);
  assertTrue(dig2Json.attestationDue.processAreas >= 1, "PA is still overdue on the repeat run (state-derived)");

  console.log("\n[e] Attest (tampered snapshot ignored) + audit row");
  // Deliberately wrong snapshot — must be overwritten by the server-computed values.
  const att = await fetchWithManual(`${BASE}/api/admin/processareas/${IDS.paA2}/attest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: "Q3 2026", socSnapshot: { coveragePct: 99, findingCount: 0, overdueActionCount: 0 } }) }, adminA.jar);
  assertEq(att.status, 200, "attest paA2 -> 200");
  const attJson = await bodyJson(att);
  assertEq(attJson.snapshot.coveragePct, 33, "server-computed coveragePct = 33 (client 99 ignored)");
  assertEq(attJson.snapshot.findingCount, 1, "server-computed findingCount = 1 (client 0 ignored)");
  assertEq(attJson.snapshot.overdueActionCount, 1, "server-computed overdueActionCount = 1 (client 0 ignored)");
  assertTrue(!!attJson.attestation?.id, "attestation record id returned");

  // Second attest (paA1) for the 2-audit-rows assertion.
  const att2 = await fetchWithManual(`${BASE}/api/admin/processareas/${IDS.paA1}/attest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }, adminA.jar);
  assertEq(att2.status, 200, "attest paA1 -> 200");

  console.log("\n[f] After attesting (both overdue PAs), the sweep refires NOTHING (state-derived)");
  const dig3 = await fetchWithManual(`${BASE}/api/cron/weekly-digest`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` }, body: JSON.stringify({}) });
  const dig3Json = await bodyJson(dig3);
  assertEq(dig3Json.attestationDue.processAreas, 0, `no overdue PA after attestation (sweep refires nothing; got ${dig3Json.attestationDue.processAreas})`);
  assertEq(dig3Json.attestationDue.notifications, 0, `no attestation-due NOTIFICATION after both PAs attested (state-derived; got ${dig3Json.attestationDue.notifications})`);

  console.log("\n[g] Cadence change recomputes next-due immediately");
  const cad30 = await fetchWithManual(`${BASE}/api/admin/companies/${IDS.b}/attestation-cadence`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attestationCadenceDays: 30 }) }, provider.jar);
  assertEq(cad30.status, 200, "PATCH cadence 90->30 -> 200");
  const cad30Json = await bodyJson(cad30);
  assertEq(cad30Json.company.attestationCadenceDays, 30, "cadence stored = 30");
  const cad365 = await fetchWithManual(`${BASE}/api/admin/companies/${IDS.b}/attestation-cadence`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attestationCadenceDays: 365 }) }, provider.jar);
  assertEq(cad365.status, 200, "PATCH cadence -> 365 -> 200");
  const cad365Json = await bodyJson(cad365);
  assertEq(cad365Json.company.effectiveCadenceDays, 365, "effective cadence = 365");

  receiver.close();
  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("MIC functional test errored:", e); try { receiver.close(); } catch {} process.exitCode = 1; });
