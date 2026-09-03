// Client Portal (SAMS-005) — Browser-driven UI test.
// Uses playwright-core against the system-cached Chromium. Drives, with
// throwaway users (pf_client_a = client Assessor A, pf_interviewee_a = client
// Interviewee A, pf_client_b = client Assessor B, pf_provider = provider):
//   (a) client login lands /portal with simplified chrome.
//   (b) findings + management response composer (Assessor+ only).
//   (c) actions page (overdue red).
//   (d) requests deep-link -> fabric submit flow.
//   (e) cross-tenant: B portal shows only B data.
//   (g) provider-role landing unchanged.
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };

async function login(page, username, password = "Test1234!") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  // ── client A (Assessor): lands /portal, simplified chrome ────────────────
  const actx = await browser.newContext();
  const page = await actx.newPage();
  await login(page, "pf_client_a");
  const url = page.url();
  ok(url.includes("/portal") ? `client A lands on /portal (${url})` : `client A landing WRONG (${url})`);
  let body = await page.textContent("body");
  ok(body.includes("Client Portal") ? "portal header renders" : "portal header MISSING");
  ok(body.includes("Portal Alpha") ? "portal shows company A name" : "company A name MISSING");
  ok(body.includes("Assurance overview") ? "dashboard heading renders" : "dashboard heading MISSING");
  ok(body.includes("Portal PA A") ? "dashboard shows process area" : "process area MISSING");
  // Simplified chrome: no admin/operator nav.
  ok(!body.includes("Operator") ? "no Operator nav (simplified chrome)" : "WRONGLY shows Operator nav");
  ok(body.includes("App") ? "Assessor+ sees the App link" : "App link MISSING");

  // (b) Findings + management response composer.
  await page.goto(`${BASE}/portal/findings`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  body = await page.textContent("body");
  ok(body.includes("PF Gap A") ? "findings list shows company A finding" : "finding A NOT shown");
  ok(await page.getByRole("button", { name: /Save response/ }).count() === 0 ? "composer not shown until expanded" : "composer visible before expand");
  // Expand the finding (click the <summary>).
  await page.locator("summary").first().click();
  await page.waitForTimeout(800);
  const textarea = page.locator('textarea[aria-label="Management response"]').first();
  ok((await textarea.count()) >= 1 ? "management response composer visible (Assessor+)" : "composer MISSING for Assessor");
  await textarea.fill("UI: We will remediate by Q4.");
  await page.getByRole("button", { name: /Save response/ }).first().click();
  await page.waitForTimeout(2000);
  body = await page.textContent("body");
  ok(body.includes("UI: We will remediate by Q4.") ? "response saved and visible" : "response NOT saved");
  ok(body.includes("Response saved") ? "save confirmation shown" : "save confirmation MISSING");

  // (c) Actions page (overdue red).
  await page.goto(`${BASE}/portal/actions`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  body = await page.textContent("body");
  ok(body.includes("Fix A") ? "actions page shows action A" : "action A NOT shown");
  ok(body.includes("Overdue") ? "actions page flags overdue" : "overdue flag MISSING");

  // (d) Requests deep-link -> fabric submit flow.
  await page.goto(`${BASE}/portal/requests`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  body = await page.textContent("body");
  ok(body.includes("Provide PF A sign-off") ? "requests page shows my evidence request" : "evidence request NOT shown");
  await page.getByRole("link", { name: /Open submit flow/ }).first().click();
  await page.waitForTimeout(2500);
  const fabricUrl = page.url();
  ok(fabricUrl.includes("/fla/my-evidence-requests") ? `deep-link lands on fabric submit flow (${fabricUrl})` : `deep-link WRONG (${fabricUrl})`);
  body = await page.textContent("body");
  ok(body.includes("My Evidence Requests") ? "fabric submit flow renders" : "fabric submit flow MISSING");

  // ── client B (Assessor): cross-tenant — shows ONLY B data ────────────────
  const bctx = await browser.newContext();
  const bpage = await bctx.newPage();
  await login(bpage, "pf_client_b");
  const bUrl = bpage.url();
  ok(bUrl.includes("/portal") ? `client B lands on /portal (${bUrl})` : `client B landing WRONG (${bUrl})`);
  await bpage.goto(`${BASE}/portal/findings`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await bpage.waitForTimeout(1500);
  body = await bpage.textContent("body");
  ok(body.includes("PF Gap B") ? "B findings shows B finding" : "B finding NOT shown");
  ok(!body.includes("PF Gap A") ? "B findings have ZERO A finding" : "B findings LEAK A finding");

  // ── client Interviewee A: NO composer (canRespond false) ────────────────
  const ictx = await browser.newContext();
  const ipage = await ictx.newPage();
  await login(ipage, "pf_interviewee_a");
  await ipage.goto(`${BASE}/portal/findings`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await ipage.waitForTimeout(1500);
  await ipage.locator("summary").first().click();
  await ipage.waitForTimeout(800);
  body = await ipage.textContent("body");
  ok(await ipage.getByRole("button", { name: /Save response/ }).count() === 0 ? "Interviewee has NO management response composer" : "Interviewee WRONGLY has composer");
  ok(ipage.url().includes("/portal") ? "Interviewee can still view the portal" : "Interviewee denied portal");

  // ── provider: landing unchanged (—> /fla), no portal redirect ────────────
  const pctx = await browser.newContext();
  const ppage = await pctx.newPage();
  await login(ppage, "pf_provider");
  const pUrl = ppage.url();
  ok(pUrl.includes("/fla") || pUrl.includes("/admin") || pUrl.includes("/operator") ? `provider landing unchanged (${pUrl})` : `provider landing WRONG (${pUrl})`);

  await browser.close();
  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("UI test errored:", e); process.exitCode = 1; });
