// SAMS-008 review round-1 — HTTP write-boundary re-validation repro.
// Faithful to Conan's finding: a DIRECT provider API commit (no dry-run) with
// role=Superuser / empty username must now be refused with 4xx + ZERO writes.
// Run against the built server (:3201) connected to the throwaway DB.
import { spawnSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3201";
const PROVIDER = { u: "wiz_provider", p: "Wiz1234!" };

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  \u2713 " + m); };
const fail = (m) => { checks++; failures++; console.error("  \u2717 FAIL: " + m); };
const assertTrue = (cond, m) => (cond ? ok(m) : fail(m));
const assertEq = (actual, expected, m) =>
  (actual === expected ? ok(`${m} (= ${expected})`) : fail(`${m}: expected ${expected}, got ${actual}`));

function probe(...args) {
  const r = spawnSync("node_modules/.bin/tsx", ["scripts/onboarding/db_probe.mts", ...args], { env: process.env, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

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
async function fetchJ(url, opts = {}, jar) {
  const headers = new Headers(opts.headers || {});
  if (jar) headers.set("cookie", jar.header());
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  if (jar && res.headers.getSetCookie) jar.set(res.headers.getSetCookie());
  return res;
}
async function login(username, password) {
  const jar = new Jar();
  const csrf = await (await fetchJ(`${BASE}/api/auth/csrf`, { method: "GET" }, jar)).json().catch(() => ({}));
  if (!csrf?.csrfToken) return { ok: false, jar };
  const body = new URLSearchParams({ csrfToken: csrf.csrfToken, username, password, json: "true" });
  await fetchJ(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  }, jar);
  const sess = await (await fetchJ(`${BASE}/api/auth/session`, { method: "GET" }, jar)).json().catch(() => ({}));
  return { ok: !!(sess?.user), jar };
}
const post = async (path, body, jar) =>
  fetchJ(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, jar);

const testCompanyID = `WIZHTTP${Date.now().toString().slice(-5)}`;

async function main() {
  console.log(`\n=== SAMS-008 HTTP write-boundary re-validation (company ${testCompanyID}) ===\n`);
  const provider = await login(PROVIDER.u, PROVIDER.p);
  assertTrue(provider.ok, "provider login ok");

  // Create a throwaway company (no content needed for the users step).
  const create = await post("/api/operator/onboarding/company", { companyID: testCompanyID, companyName: "HTTP Boundary Test", dryRun: false }, provider.jar);
  const created = await create.json();
  assertEq(create.status, 201, "company commit 201");
  const companyId = created.company.id;
  assertTrue(!!companyId, "company created with id");

  // EXACT repro A: role=Superuser → must be 422 now (was 201).
  const badRole = await post("/api/operator/onboarding/users", { companyId, rows: [{ name: "Super", username: `${testCompanyID}-super`, role: "Superuser" }], dryRun: false }, provider.jar);
  const badRoleData = await badRole.json();
  assertEq(badRole.status, 422, `commit role=Superuser -> 422 (was 201 before the fix; got ${badRole.status})`);
  assertTrue(!!badRoleData.report && badRoleData.report.invalidRoles.some((r) => r.role === "Superuser"), "422 carries invalidRoles report");
  assertEq(probe("user-exists", `${testCompanyID}-super`), "false", "Superuser NOT created (zero writes)");

  // EXACT repro B: empty username → must be 4xx now (was 201).
  const emptyUser = await post("/api/operator/onboarding/users", { companyId, rows: [{ name: "Ghost", username: "", role: "Assessor" }], dryRun: false }, provider.jar);
  assertTrue([409, 422].includes(emptyUser.status), `commit empty username -> 4xx (got ${emptyUser.status})`);
  assertEq(probe("user-exists", "Ghost"), "false", "empty-username (Ghost) NOT created (zero writes)");

  // mixed junk batch → 4xx, zero partial users.
  const junk = await post("/api/operator/onboarding/users", { companyId, rows: [
    { name: "Bad", username: `${testCompanyID}-bad1`, role: "Superuser" },
    { name: "", username: `${testCompanyID}-bad2` },
  ], dryRun: false }, provider.jar);
  assertTrue([409, 422].includes(junk.status), `mixed junk batch -> 4xx (got ${junk.status})`);
  assertEq(probe("user-exists", `${testCompanyID}-bad1`), "false", "junk bad1 NOT created");
  assertEq(probe("user-exists", `${testCompanyID}-bad2`), "false", "junk bad2 NOT created");

  // Control: a GOOD commit still succeeds (201) and yields a one-time wizardId.
  const good = await post("/api/operator/onboarding/users", { companyId, rows: [{ name: "Gamma", username: `${testCompanyID}-gamma`, role: "Assessor" }], dryRun: false }, provider.jar);
  const goodData = await good.json();
  assertEq(good.status, 201, "clean commit 201 (regression guard)");
  assertEq(goodData.created, 1, "clean commit created 1");
  assertTrue(!!goodData.wizardId, "clean commit returns wizardId");
  assertTrue(!JSON.stringify(goodData).includes("tempPassword"), "clean commit response has NO temp passwords");
  assertEq(probe("user-exists", `${testCompanyID}-gamma`), "true", "provisioned user exists");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("HTTP repro errored:", e); process.exitCode = 1; });
