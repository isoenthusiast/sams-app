// SAMS-008 Pilot Onboarding Wizard — FUNCTIONAL (server/HTTP) test runner.
// Run against a BUILT server (npm start) with the DB seeded by scripts/onboarding/seed.ts.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PROVIDER = { u: "wiz_provider", p: "Wiz1234!" };
const CLIENT = { u: "wiz_client", p: "Wiz1234!" };

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => (cond ? ok(m) : fail(m));
const assertEq = (actual, expected, m) =>
  (actual === expected ? ok(`${m} (= ${expected})`) : fail(`${m}: expected ${expected}, got ${actual}`));

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
  if (!csrf?.csrfToken) return { ok: false, jar, token: null };
  const body = new URLSearchParams({ csrfToken: csrf.csrfToken, username, password, json: "true" });
  await fetchJ(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  }, jar);
  const sess = await (await fetchJ(`${BASE}/api/auth/session`, { method: "GET" }, jar)).json().catch(() => ({}));
  return { ok: !!(sess?.user), jar, session: sess };
}

const post = async (path, body, jar) =>
  fetchJ(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, jar);

// DB probes via tsx helper (the HTTP test can't talk to Postgres directly).
function probe(...args) {
  const r = spawnSync("node_modules/.bin/tsx", ["scripts/onboarding/db_probe.mts", ...args], { env: process.env, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}
function hardDelete(companyId, exportPath) {
  const r = spawnSync("node_modules/.bin/tsx", ["scripts/db/company_hard_delete.ts", companyId, "--confirm", "--export", exportPath], { env: process.env, encoding: "utf8" });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const testCompanyID = `WIZF${Date.now().toString().slice(-6)}`;
const testCompanyName = "Wizard Functional Test";

async function main() {
  console.log(`\n=== SAMS-008 Onboarding functional run @ ${BASE} (company ${testCompanyID}) ===\n`);

  console.log("[0] Logging in");
  const provider = await login(PROVIDER.u, PROVIDER.p);
  const client = await login(CLIENT.u, CLIENT.p);
  assertTrue(provider.ok, "provider login ok");
  assertTrue(client.ok, "client (non-provider) login ok");

  // ── (a) Full 4-step run ──────────────────────────────────────────────────
  console.log("\n--- (a) full run ---");
  const dry1 = await (await post("/api/operator/onboarding/company", { companyID: testCompanyID, companyName: testCompanyName, dryRun: true }, provider.jar)).json();
  assertTrue(dry1.ok, "company dry-run ok (unique ID)");
  assertEq(dry1.errors.length, 0, "company dry-run no errors");

  const create = await post("/api/operator/onboarding/company", { companyID: testCompanyID, companyName: testCompanyName, dryRun: false }, provider.jar);
  const created = await create.json();
  assertEq(create.status, 201, "company commit 201");
  const companyId = created.company.id;
  assertTrue(!!companyId, "company created with id");

  const contentDry = await (await post("/api/operator/onboarding/content", { companyId, dryRun: true }, provider.jar)).json();
  const contentCommit = await (await post("/api/operator/onboarding/content", { companyId, dryRun: false }, provider.jar)).json();
  assertTrue(contentCommit.ok, "content commit ok");
  assertEq(JSON.stringify(contentCommit.results), JSON.stringify(contentDry.preview), "bootstrap dry-run counts == final results");
  assertTrue(contentCommit.results.requirements > 0 && contentCommit.results.controls > 0 && contentCommit.results.standards > 0,
    `bootstrap produced content (std=${contentCommit.results.standards}, req=${contentCommit.results.requirements}, ctl=${contentCommit.results.controls})`);
  assertEq(contentCommit.results.standards, 6, "bootstrap standards = 6 (SAMS001)");
  assertEq(contentCommit.results.controls, 1048, "bootstrap controls = 1048 (SAMS001)");

  const userRows = [
    { name: "Wizard Alpha", username: `${testCompanyID}-alpha`, email: "a@example.com", role: "Assessor", managerName: "" },
    { name: "Wizard Beta", username: `${testCompanyID}-beta`, email: "b@example.com", role: "Admin", managerName: "" },
    { name: "Wizard Gamma", username: `${testCompanyID}-gamma`, email: "g@example.com", role: "Assessor", managerName: "Wizard Provider" },
  ];
  const userDry = await (await post("/api/operator/onboarding/users", { companyId, rows: userRows, dryRun: true }, provider.jar)).json();
  assertTrue(!userDry.blocked, "users dry-run not blocked");
  assertEq(userDry.report.valid, 3, "users dry-run: 3 valid");

  const userCommit = await post("/api/operator/onboarding/users", { companyId, rows: userRows, dryRun: false }, provider.jar);
  const userData = await userCommit.json();
  assertEq(userCommit.status, 201, "users commit 201");
  assertEq(userData.created, 3, "users commit created 3");
  assertTrue(!JSON.stringify(userData).includes("tempPassword"), "users commit response contains NO passwords");
  const wizardId = userData.wizardId;
  assertTrue(!!wizardId, "users commit returned wizardId");

  // Provisioned user exists + passwordHash is a bcrypt hash (not plaintext).
  assertEq(probe("user-exists", userRows[0].username), "true", "provisioned user row exists");
  assertEq(probe("user-password-is-hash", userRows[0].username), "hash", "provisioned passwordHash is bcrypt (no plaintext)");

  // finalize → report + one-time temp passwords.
  const fin1 = await (await post("/api/operator/onboarding/finalize", { companyId, wizardId }, provider.jar)).json();
  assertTrue(fin1.report.approvedForGoLive, "report approved for go-live");
  assertTrue(Array.isArray(fin1.tempPasswords) && fin1.tempPasswords.length === 3, "finalize reveals 3 temp passwords (once)");
  const passwords = fin1.tempPasswords.map((t) => t.tempPassword);
  assertTrue(passwords.every((p) => p && p.length >= 8), "temp passwords are non-trivial strings");

  // ── (d) temp passwords appear ONLY on the finish screen ──────────────────
  console.log("\n--- (d) temp-password leak scan ---");
  const fin2 = await (await post("/api/operator/onboarding/finalize", { companyId, wizardId }, provider.jar)).json();
  assertEq(fin2.tempPasswords.length, 0, "second finalize returns NO passwords (one-time, consumed)");
  const activityHits = Number(probe("activitylog", ...passwords));
  assertEq(activityHits, 0, "temp passwords appear ZERO times in ActivityLog");
  // user record stores a hash, not the plaintext.
  assertEq(probe("user-password-is-hash", userRows[0].username), "hash", "stored password is a bcrypt hash");

  // ── (b) dry-run catches duplicates / bad role / unresolved manager / 409 ──
  console.log("\n--- (b) negative dry-runs ---");
  const dupCompany = await (await post("/api/operator/onboarding/company", { companyID: "SAMS001", companyName: "X", dryRun: true }, provider.jar)).json();
  assertTrue(dupCompany.errors.some((e) => e.code === "DUPLICATE"), "dry-run flags DUPLICATE companyID (SAMS001)");
  assertTrue(!dupCompany.ok, "dry-run ok=false for duplicate companyID");
  const dup404 = await post("/api/operator/onboarding/company", { companyID: "SAMS001", companyName: "X", dryRun: false }, provider.jar);
  assertEq(dup404.status, 409, "company commit returns 409 for duplicate companyID");

  const negRows = [
    { name: "Dup", username: userRows[0].username, role: "Assessor" }, // existing in DB
    { name: "Dup2", username: userRows[0].username, role: "Assessor" }, // batch duplicate
    { name: "BadRole", username: `${testCompanyID}-bad`, role: "Superuser" },
    { name: "", username: `${testCompanyID}-noname`, role: "Assessor" }, // missing name
    { name: "NoMgr", username: `${testCompanyID}-nomgr`, role: "Assessor", managerName: "No Such Manager XYZ" },
  ];
  const negDry = await (await post("/api/operator/onboarding/users", { companyId, rows: negRows, dryRun: true }, provider.jar)).json();
  assertTrue(negDry.report.duplicates.some((d) => d.kind === "existing"), "dry-run flags EXISTING duplicate username");
  assertTrue(negDry.report.duplicates.some((d) => d.kind === "batch"), "dry-run flags BATCH duplicate username");
  assertTrue(negDry.report.invalidRoles.some((r) => r.role === "Superuser"), "dry-run flags invalid role (Superuser)");
  assertTrue(negDry.report.missingFields.some((m) => m.fields.includes("name")), "dry-run flags missing name");
  assertTrue(negDry.report.unresolvedManagers.some((m) => m.managerName === "No Such Manager XYZ"), "dry-run flags unresolved manager");
  assertTrue(negDry.blocked, "dry-run commit BLOCKED when duplicates/bad roles present");

  // ── (b2) COMMIT re-validates at the write boundary (review round-1 fix) ──
  // Direct API commit (NO dry-run) with junk must be refused with 4xx and ZERO
  // writes — the server enforces what the dry-run rejects (spec settled #4).
  console.log("\n--- (b2) commit write-boundary re-validation ---");
  const badCommitRows = [
    { name: "Bad Role", username: `${testCompanyID}-badrole`, role: "Superuser" },
    { name: "", username: `${testCompanyID}-noname` }, // missing name
    { name: "No User", username: "", role: "Assessor" }, // missing username
    { name: "Clash", username: userRows[0].username, role: "Assessor" }, // existing → duplicate
  ];
  const badCommit = await post("/api/operator/onboarding/users", { companyId, rows: badCommitRows, dryRun: false }, provider.jar);
  const badCommitData = await badCommit.json();
  assertTrue([409, 422].includes(badCommit.status), `direct commit with junk rows → 4xx (got ${badCommit.status})`);
  assertTrue(!!badCommitData.report, "direct commit refusal carries the validation report");
  assertTrue(!JSON.stringify(badCommitData).includes("tempPassword"), "refusal response contains NO passwords");
  assertEq(probe("user-exists", `${testCompanyID}-badrole`), "false", "bad-role user NOT created (zero writes on refusal)");
  assertEq(probe("user-exists", `${testCompanyID}-noname`), "false", "no-name user NOT created (zero writes on refusal)");

  // Reproduce Conan's exact two repros individually (each must be refused).
  const badRole = await post("/api/operator/onboarding/users", { companyId, rows: [{ name: "Super", username: `${testCompanyID}-super`, role: "Superuser" }], dryRun: false }, provider.jar);
  assertEq(badRole.status, 422, "commit with role=Superuser → 422 (was 201 before the fix)");
  assertEq(probe("user-exists", `${testCompanyID}-super`), "false", "Superuser row NOT created");
  const emptyUser = await post("/api/operator/onboarding/users", { companyId, rows: [{ name: "Ghost", username: "", role: "Assessor" }], dryRun: false }, provider.jar);
  assertTrue([409, 422].includes(emptyUser.status), `commit with empty username → 4xx (got ${emptyUser.status})`);
  assertEq(probe("user-exists", "Ghost"), "false", "empty-username (Ghost) row NOT created");

  // ── (c) non-provider → 403 on all wizard routes ──────────────────────────
  console.log("\n--- (c) non-provider 403 ---");
  const routes = [
    ["/api/operator/onboarding/company", "POST", { companyID: "ZZZ", companyName: "Z", dryRun: true }],
    ["/api/operator/onboarding/content", "GET", undefined],
    ["/api/operator/onboarding/content", "POST", { companyId: "x", dryRun: true }],
    ["/api/operator/onboarding/users", "POST", { companyId: "x", rows: [], dryRun: true }],
    ["/api/operator/onboarding/finalize", "POST", { companyId: "x", wizardId: "w" }],
  ];
  for (const [path, method, body] of routes) {
    const res = await fetchJ(`${BASE}${path}`, method === "GET" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, client.jar);
    assertEq(res.status, 403, `non-provider ${method} ${path} → 403`);
  }
  // Also: unauthenticated → should be gated (401/302).
  const noAuth = await fetchJ(`${BASE}/api/operator/onboarding/content`, { method: "GET" });
  assertTrue([401, 403, 302, 307].includes(noAuth.status), `unauthenticated GET content gated (${noAuth.status})`);

  // ── (e) simulated bootstrap/user failure mid-commit → zero partial users ──
  console.log("\n--- (e) transactional rollback ---");
  const partialRows = [
    { name: "Partial One", username: `${testCompanyID}-partial1`, role: "Assessor" },
    { name: "Partial Clash", username: userRows[0].username, role: "Assessor" }, // existing → unique violation
  ];
  const partCommit = await post("/api/operator/onboarding/users", { companyId, rows: partialRows, dryRun: false }, provider.jar);
  assertTrue(partCommit.status >= 400, "commit with a mid-batch duplicate fails (status >= 400)");
  assertEq(probe("user-exists", `${testCompanyID}-partial1`), "false", "FIRST user of the failed batch does NOT exist (rollback, zero partial users)");

  // ── (g) hard-delete the wizard-made company (proves T3 path on it) ───────
  console.log("\n--- (g) hard-delete wizard-made company ---");
  assertEq(probe("set-deletion-scheduled", companyId), "armed", "company safety-net armed");
  const exportRes = await fetchJ(`${BASE}/api/admin/companies/${companyId}/export`, { method: "GET" }, provider.jar);
  assertEq(exportRes.status, 200, "client export 200");
  const exportPath = `/tmp/wiz_export_${companyId}.zip`;
  fs.writeFileSync(exportPath, Buffer.from(await exportRes.arrayBuffer()));
  const hd = hardDelete(companyId, exportPath);
  assertEq(hd.status, 0, `company_hard_delete.ts exits 0 (got ${hd.status}: ${(hd.err || hd.out).slice(0, 120)})`);
  assertEq(probe("company-by-code", testCompanyID), "null", "company fully removed via hard delete");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("Onboarding functional test errored:", e); process.exitCode = 1; });
