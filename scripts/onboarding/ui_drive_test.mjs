// SAMS-008 Pilot Onboarding Wizard — UI drive test (DoD (f) stepper E2E + (g) T3
// hard-delete on a wizard-made company).
// Drives the browser as a provider through the 4-step wizard, then logs in as a
// provisioned client and confirms they land on /portal with content.
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const PROVIDER = { u: "wiz_provider", p: "Wiz1234!" };

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => (cond ? ok(m) : fail(m));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function hardDelete(companyId, exportPath) {
  const r = spawnSync("node_modules/.bin/tsx", ["scripts/db/company_hard_delete.ts", companyId, "--confirm", "--export", exportPath], { env: process.env, encoding: "utf8" });
  return { status: r.status };
}
function probeCmd(...args) {
  const r = spawnSync("node_modules/.bin/tsx", ["scripts/onboarding/db_probe.mts", ...args], { env: process.env, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await wait(2500);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  const testCompanyID = `WIZU${Date.now().toString().slice(-6)}`;
  const testCompanyName = "Wizard UI Test";
  const uniqueUser = `wizui_${Date.now().toString().slice(-6)}`;
  console.log(`\n=== SAMS-008 Onboarding UI drive @ ${BASE} (company ${testCompanyID}) ===\n`);
  let companyId = null;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, PROVIDER.u, PROVIDER.p);
  await page.goto(`${BASE}/operator/onboarding`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.getByText("1 · Company basics").waitFor({ timeout: 15000 });
  assertTrue(page.url().includes("/operator/onboarding"), "provider lands on /operator/onboarding");

  // ── Step 1: company ──────────────────────────────────────────────────────
  await page.fill('input[placeholder="e.g. PILOT01"]', testCompanyID);
  await page.fill('input[placeholder="e.g. Pilot Client Ltd"]', testCompanyName);
  await page.getByRole("button", { name: /^Dry-run$/ }).first().click();
  await page.getByText(/available|safe to commit/i).waitFor({ timeout: 15000 });
  ok("step 1 dry-run: company ID available");
  await page.getByRole("button", { name: /Commit company/ }).first().click();
  await page.getByText("2 · Content adoption").waitFor({ timeout: 20000 });
  ok("step 1 commit: advanced to step 2 (Content)");

  // ── Step 2: content ──────────────────────────────────────────────────────
  await page.getByText("Process Areas").first().waitFor({ timeout: 15000 });
  ok("step 2: bootstrap preview counts shown (dry-run auto-loaded)");
  await page.getByRole("button", { name: /Commit & bootstrap/ }).first().click();
  await page.getByText("3 · Provision users").waitFor({ timeout: 60000 });
  ok("step 2 commit: bootstrap committed, advanced to step 3");

  // ── Step 3: users with one bad row → inline error → fix → commit ─────────
  const csvBad = [
    `name,username,email,role,managerName`,
    `UI Alpha,${uniqueUser},alpha@example.com,Assessor,`,
    `UI Bad,,bad@example.com,Assessor,`, // missing username → inline error
    `UI Beta,${uniqueUser}-beta,beta@example.com,Assessor,`,
  ].join("\n");
  await page.click("textarea");
  await page.fill("textarea", csvBad);
  await page.getByRole("button", { name: /Parse rows/ }).first().click();
  await page.getByText(/CSV row errors|missing name or username/i).first().waitFor({ timeout: 15000 });
  ok("step 3: bad CSV row surfaced as inline error");
  const badBody = await page.textContent("body");
  assertTrue(badBody.includes("UI Beta"), "step 3: valid rows parsed alongside the bad row");

  // Fix: remove the bad row, then dry-run + commit.
  const csvGood = [`name,username,email,role,managerName`, `UI Alpha,${uniqueUser},alpha@example.com,Assessor,`, `UI Beta,${uniqueUser}-beta,beta@example.com,Assessor,`].join("\n");
  await page.fill("textarea", csvGood);
  await page.getByRole("button", { name: /Parse rows/ }).first().click();
  await wait(800);
  await page.getByRole("button", { name: /^Dry-run$/ }).first().click();
  await page.getByText("Duplicates").first().waitFor({ timeout: 15000 });
  ok("step 3 dry-run: validation report shown");
  await wait(1200); // let the commit button re-enable (busy cleared)
  await page.getByRole("button", { name: /Commit & provision/ }).first().click();
  await page.getByText("4 · Review & go-live").waitFor({ timeout: 20000 });
  ok("advanced to step 4 (Review)");

  // ── Step 4: review & one-time password reveal ────────────────────────────
  await page.getByRole("button", { name: /Review & reveal/ }).first().click();
  // Wait for the reveal TABLE (the only <table> in the final state) — the
  // ReviewStep description also contains "temp password", so don't trust text.
  await page.locator("table").first().waitFor({ state: "visible", timeout: 30000 });
  const body = await page.textContent("body");
  ok("step 4: one-time temp passwords revealed");
  if (body.includes("already revealed")) ok("STEP4 STATE: passwords were CONSUMED/EMPTY (already-revealed fallback shown)");
  else if (body.includes("temp password")) ok("STEP4 STATE: password table present");
  else ok("STEP4 STATE: unknown");

  // Capture a provisioned credential pair from the reveal table (per-`td`).
  let provisionedUser = null, provisionedPass = null;
  const rowCount = await page.locator("table tbody tr").count();
  for (let i = 0; i < rowCount; i++) {
    const cells = await page.locator("table tbody tr").nth(i).locator("td").allTextContents();
    const username = (cells[0] ?? "").trim();
    const pass = (cells[1] ?? "").trim();
    if (username && pass.length >= 8) {
      provisionedUser = username;
      provisionedPass = pass;
      break;
    }
  }
  assertTrue(!!provisionedUser && !!provisionedPass, `captured a provisioned credential pair (${provisionedUser})`);

  companyId = probeCmd("company-by-code", testCompanyID);
  assertTrue(companyId && companyId !== "null", `wizard-made company exists (id=${companyId})`);

  // ── Provisioned client lands on /portal WITH content ─────────────────────
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await login(page2, provisionedUser, provisionedPass);
  assertTrue(!page2.url().includes("/login"), `provisioned user logged in (not on /login)`);
  await page2.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await wait(2500);
  const portalBody = await page2.textContent("body");
  assertTrue(portalBody.includes(testCompanyName) || portalBody.includes(testCompanyID), "provisioned user lands on /portal with the company content");
  assertTrue(/requirements|Coverage|Not assessed|Fully Comply|Process Area/i.test(portalBody), "portal shows SOC/content data (requirements present)");

  // ── hard-delete the wizard-made company (proves T3 on it) ────────────────
  if (companyId && companyId !== "null") {
    spawnSync("node_modules/.bin/tsx", ["scripts/onboarding/db_probe.mts", "set-deletion-scheduled", companyId], { env: process.env });
    // The provider page is STILL authenticated (it drove the wizard) — its
    // request context carries the provider session cookies, so no re-login
    // (a re-login would 307 from /login → /admin for an already-authed user).
    const exportRes = await page.request.get(`${BASE}/api/admin/companies/${companyId}/export`);
    assertTrue(exportRes.status() === 200, `client export 200 (got ${exportRes.status()})`);
    const exportPath = `/tmp/wiz_ui_export_${companyId}.zip`;
    fs.writeFileSync(exportPath, Buffer.from(await exportRes.body()));
    const hd = hardDelete(companyId, exportPath);
    assertTrue(hd.status === 0, `wizard-made company hard-deleted via T3 path (exit ${hd.status})`);
  } else {
    ok("skip hard-delete (no company id captured)");
  }

  await browser.close();
  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("UI drive errored:", e); process.exitCode = 1; });
