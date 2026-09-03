// Data Trust Gate — FUNCTIONAL (server/HTTP) test runner.
// Run against a built server (npm start) + throwaway DB seeded by functional_seed.ts.
// Covers the HTTP/API surfaces: retention flow (archive→login-deny→reinstate),
// client-export ZIP (structure + manifest), whole-DB backup admin-only, and
// hard-delete refusals. The browser-driven retention UI is covered separately by
// ui_drive_test.mjs.

import { spawnSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";

let failures = 0;
let checks = 0;
function ok(m) { checks++; console.log("  ✓ " + m); }
function fail(m) { checks++; failures++; console.error("  ✗ FAIL: " + m); }
function isGated(status) { return status === 401 || status === 403 || status === 302 || status === 307; }

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
  return { ok: !!(sess?.user), jar, session: sess };
}

// manifest.json is stored UNCOMPRESSED + pretty-printed, so allow whitespace after ':'.
function validateZip(buf) {
  const text = buf.toString("utf8");
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03)) return { ok: false, reason: "not a ZIP" };
  const eocd = buf.lastIndexOf(Buffer.from("PK\x05\x06", "binary"));
  if (eocd < 0) return { ok: false, reason: "no EOCD" };
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const manifestFound = text.match(/"companyId"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  return { ok: true, totalEntries, manifestFound };
}

async function main() {
  console.log(`\n=== Functional retest against ${BASE} ===`);

  console.log("\n[1] Admin login");
  const admin = await login("dta_admin", "Admin1234!");
  ok(admin.ok ? "admin logged in" : `admin login FAILED (${admin.reason ?? "no session"})`);

  console.log("\n[2] Retention flow: archive → login-deny for client → reinstate");
  if (admin.ok) {
    const archive = await fetchWithManual(`${BASE}/api/admin/companies/cmp_dta_a/retention`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive" }),
    }, admin.jar);
    const archiveJson = await archive.json().catch(() => ({}));
    ok(archive.status === 200 && !!archiveJson.company?.archivedAt ? "archive -> archivedAt set" : `archive failed (${archive.status} ${archiveJson.error ?? ""})`);

    const clientLogin = await login("dta_alpha", "Test1234!");
    ok(!clientLogin.ok ? "archived-company user login DENIED" : "archived-company user login SHOULD be denied");

    const reinstate = await fetchWithManual(`${BASE}/api/admin/companies/cmp_dta_a/retention`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reinstate" }),
    }, admin.jar);
    const reJson = await reinstate.json().catch(() => ({}));
    ok(reinstate.status === 200 && reJson.company?.archivedAt === null && reJson.company?.deletionScheduledAt === null
      ? "reinstate clears both timestamps" : `reinstate failed (${reinstate.status} ${reJson.error ?? ""})`);

    const clientLogin2 = await login("dta_alpha", "Test1234!");
    ok(clientLogin2.ok ? "reinstated-company user login restored" : "reinstated-company user login SHOULD restore");
  }

  console.log("\n[3] Client export ZIP");
  if (admin.ok) {
    const exp = await fetchWithManual(`${BASE}/api/admin/companies/cmp_dta_a/export`, { method: "GET" }, admin.jar);
    const buf = Buffer.from(await exp.arrayBuffer());
    ok(exp.status === 200 && exp.headers.get("content-type")?.includes("zip") ? "export 200 application/zip" : `export status ${exp.status}`);
    const v = validateZip(buf);
    ok(v.ok ? `ZIP valid (${v.totalEntries} entries, manifest company=${v.manifestFound})` : `ZIP invalid: ${v.reason}`);
    ok(v.manifestFound === "cmp_dta_a" ? "manifest companyId matches target" : `manifest companyId mismatch (${v.manifestFound})`);
    const fs = await import("node:fs");
    fs.writeFileSync("/tmp/dtg_export.zip", buf);
    console.log("   (wrote /tmp/dtg_export.zip)");
  }

  console.log("\n[4] Whole-DB backup route — unchanged + admin-only");
  const backupNoAuth = await fetchWithManual(`${BASE}/api/admin/database/backup`, { method: "GET" });
  ok(isGated(backupNoAuth.status) ? `backup unauth gated (${backupNoAuth.status})` : `backup unauth NOT gated (${backupNoAuth.status})`);
  if (admin.ok) {
    const backup = await fetchWithManual(`${BASE}/api/admin/database/backup`, { method: "GET" }, admin.jar);
    const txt = await backup.text();
    ok(backup.status === 200 && txt.includes("BEGIN;") ? "admin backup 200 + SQL body (unchanged)" : `backup admin got ${backup.status}`);
    ok(!txt.includes("manifest.json") ? "backup route has no export manifest (kept separate)" : "backup route wrongly reports manifest");
  }

  console.log("\n[5] Hard-delete refusals (script-level)");
  const runHardDelete = (args) => spawnSync(
    "./node_modules/.bin/tsx", ["scripts/db/company_hard_delete.ts", ...args], { env: process.env, encoding: "utf8" });
  const noConfirm = runHardDelete(["cmp_dta_a"]);
  ok(noConfirm.status === 2 ? "refuses w/o --confirm (exit 2)" : `no --confirm exit ${noConfirm.status}`);
  const badCompany = runHardDelete(["cmp_dta_a", "--confirm"]);
  ok(badCompany.status === 2 ? "refuses on non-pending-delete company (exit 2)" : `non-pending exit ${badCompany.status}`);

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("Functional test errored:", e); process.exitCode = 1; });
