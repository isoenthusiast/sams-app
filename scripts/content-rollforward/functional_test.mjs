// SAMS-016 (Master Content Roll-Forward) — FUNCTIONAL test runner.
// Runs against a BUILT server (npm start, PORT=3200) pointed at the throwaway DB
// seeded by scripts/content-rollforward/seed.ts, with CRON_SECRET set on the server.
// Covers owner DoD items (a), (b), (d) via HTTP; (c)/(e) assertions are DB-level in
// verify_step.ts; (f) is browser-driven in ui_drive_test.mjs.
//
//   (a) publish v2 (fromVersion:1) -> per-client RF001 shows update-available v1->v2
//       with the CORRECT diff (1 added standard/PA/req/ctl/mapping, 1 changed [CT1],
//       1 conflict [CT3], removed [CT2, MP2]); negative: a second publish is a new
//       immutable v3 (byte-stable v2 asserted in verify_step).
//   (b) adopt (dryRun + real) -> RF001 contentVersion=2; client-data checksum
//       (audits/findings/actions/evidence/conclusions/controlAssignments) identical.
//   (d) audit entry carries the diff (verify_step); client notified (in-app + webhook
//       on the local receiver); export manifest shows contentVersion 2.
import http from "node:http";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const RECEIVER_PORT = 3999;

const IDS = {
  tenant: "cmp_rf001",
  provider: "usr_rf_provider",
  adminT: "usr_rf_admin",
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
    received.push({ path: req.url, json });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});
function startReceiver() { return new Promise((resolve) => receiver.listen(RECEIVER_PORT, "127.0.0.1", resolve)); }
function got(path, needle) { return received.some((r) => r.path === path && (needle ? JSON.stringify(r.json).includes(needle) : true)); }
function count(path) { return received.filter((r) => r.path === path).length; }

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
  console.log(`\n=== SAMS-016 Content Roll-Forward functional test against ${BASE} ===`);
  // Self-contained: re-seed to a pristine v1-only baseline so the test is
  // reproducible regardless of any prior DB state (mirrors ui_drive_test.mjs).
  execSync("npx tsx scripts/content-rollforward/seed.ts", { stdio: "inherit" });
  const provider = await login("rf_provider", "Test1234!");
  const adminT = await login("rf_admin", "Test1234!");
  assertTrue(provider.ok, "provider logged in");
  assertTrue(adminT.ok, "client-Admin logged in");

  console.log("\n[a] Publish v2 (fromVersion:1) -> update-available v1->v2 with the correct diff");
  const pub = await fetchWithManual(`${BASE}/api/operator/content/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromVersion: 1 }) }, provider.jar);
  assertEq(pub.status, 200, "publish v2 -> 200");
  const pubJson = await bodyJson(pub);
  assertEq(pubJson.version, 2, "publish produced version 2");

  const content = await fetchWithManual(`${BASE}/api/operator/content`, { method: "GET" }, provider.jar);
  assertEq(content.status, 200, "GET /api/operator/content -> 200");
  const contentJson = await bodyJson(content);
  const row = (contentJson.companies ?? []).find((c) => c.companyCode === "RF001");
  assertTrue(!!row, "RF001 present in operator content list");
  const diff = row.diff;
  assertEq(row.currentVersion, 1, "RF001 currentVersion = 1");
  assertEq(row.availableVersion, 2, "RF001 availableVersion = 2");
  assertTrue(row.updateAvailable === true, "RF001 updateAvailable = true");
  assertTrue(!!diff, "diff present");
  assertTrue(diff.added.standards.length === 1, `added standards = 1 (${diff.added.standards.join(",")})`);
  assertTrue(diff.added.processAreas.length === 1, `added processAreas = 1 (${diff.added.processAreas.join(",")})`);
  assertTrue(diff.added.requirements.length === 1, `added requirements = 1 (${diff.added.requirements.join(",")})`);
  assertTrue(diff.added.controls.length === 1, `added controls = 1 (${diff.added.controls.join(",")})`);
  assertTrue(diff.added.mappings.length === 1, `added mappings = 1 (${diff.added.mappings.join(",")})`);
  assertEq(diff.changed.length, 1, "changed length = 1");
  assertTrue(diff.changed.some((c) => c.key.includes("C-QM-01")), "changed includes CT1 (C-QM-01)");
  assertEq(diff.conflicts.length, 1, "conflicts length = 1");
  assertTrue(diff.conflicts.some((c) => c.key.includes("C-ENV-03") && c.conflictReason === "changed-elsewhere"), "conflicts includes CT3 (changed-elsewhere)");
  assertTrue(diff.removed.some((r) => r.type === "control" && r.key.includes("C-QM-02") && r.superseded === true), "removed includes CT2 as superseded");
  assertTrue(diff.removed.some((r) => r.type === "mapping"), "removed includes a mapping (MP2)");

  console.log("\n[b] Adopt (dryRun then real) -> baseline v1->v2; client data untouched (checksum)");
  const dry = await fetchWithManual(`${BASE}/api/operator/content/adopt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: IDS.tenant, toVersion: 2, dryRun: true }) }, provider.jar);
  assertEq(dry.status, 200, "adopt dryRun -> 200");
  const dryJson = await bodyJson(dry);
  assertTrue(dryJson.adopted === false, "dryRun does not adopt");
  const beforeChecksum = dryJson.beforeChecksum;

  const adopt = await fetchWithManual(`${BASE}/api/operator/content/adopt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: IDS.tenant, toVersion: 2, dryRun: false }) }, provider.jar);
  assertEq(adopt.status, 200, "adopt (real) -> 200");
  const adoptJson = await bodyJson(adopt);
  assertTrue(adoptJson.adopted === true, "adopt succeeded");
  assertEq(adoptJson.contentVersion, 2, "adopted contentVersion = 2");
  assertTrue(adoptJson.beforeChecksum === adoptJson.afterChecksum, "client-data checksum identical before/after adopt");

  const after = await fetchWithManual(`${BASE}/api/operator/content`, { method: "GET" }, provider.jar);
  const afterRow = (await bodyJson(after)).companies.find((c) => c.companyCode === "RF001");
  assertEq(afterRow.currentVersion, 2, "RF001 currentVersion = 2 after adopt");

  console.log("\n[d] Client notified (in-app) + webhook received once + export shows contentVersion 2");
  const notif = await fetchWithManual(`${BASE}/api/notifications`, { method: "GET" }, adminT.jar);
  const notifJson = await bodyJson(notif);
  const rows = notifJson.notifications ?? notifJson.rows ?? [];
  assertTrue(rows.some((n) => n.type === "ContentBaselineUpdated"), "client Admin has a ContentBaselineUpdated in-app notification");
  assertTrue(got("/nh_rf001", "Content baseline updated"), "webhook receiver got the content-update notice");
  assertEq(count("/nh_rf001"), 1, "webhook notice delivered exactly once");

  const exp = await fetchWithManual(`${BASE}/api/admin/companies/${IDS.tenant}/export`, { method: "GET" }, provider.jar);
  assertEq(exp.status, 200, "client-data export -> 200");
  const expBuf = new TextDecoder().decode(await exp.arrayBuffer());
  assertTrue(expBuf.includes("contentVersion") && expBuf.includes(`"contentVersion": 2`), "export manifest carries contentVersion 2");

  console.log("\n[a-neg] Second publish of an identical snapshot -> a NEW immutable v3");
  const pub3 = await fetchWithManual(`${BASE}/api/operator/content/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromVersion: 2 }) }, provider.jar);
  assertEq(pub3.status, 200, "publish v3 -> 200");
  const pub3Json = await bodyJson(pub3);
  assertEq(pub3Json.version, 3, "second publish produced version 3 (no in-place mutate)");
  // Immutability byte-stability of v2 is asserted in verify_step (DB lens).

  receiver.close();
  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("SAMS-016 functional test errored:", e); try { receiver.close(); } catch {} process.exitCode = 1; });
