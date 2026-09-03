// Browser-driven Data Trust Gate UI test (throwaway admin flow). Uses
// playwright-core against the system-cached Chromium. Drives the company admin
// surface: retention controls render, archive → badge change, archived-company
// login denied, reinstate → restored.
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };

async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

async function gotoCompanies(page) {
  await page.goto(`${BASE}/admin?view=sysadmin`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Companies/ }).first().click();
  await page.waitForTimeout(2000);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  // [g] Company admin shows archive/schedule/reinstate controls + state badges
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "dta_admin", "Admin1234!");
  await gotoCompanies(page);
  let body = await page.textContent("body");
  ok(body.includes("Archive") ? "Archive control present" : "Archive control MISSING");
  ok(body.includes("Export") ? "Export control present" : "Export control MISSING");
  ok(body.includes("Reinstate") ? "Reinstate present while archived?" : "Reinstate absent while Active (correct)");
  ok(body.includes("Active") ? "state badge 'Active' present" : "'Active' badge MISSING");
  ok(body.includes("Archived") ? "'Archived' badge wrongly present while Active?" : "no 'Archived' badge while Active (correct)");

  // Export button downloads the ZIP (its handler is also covered by the API test [3])
  const dlPromise = page.waitForEvent("download", { timeout: 15000 }).then((d) => d).catch(() => null);
  await page.getByRole("button", { name: /^Export$/ }).first().click({ timeout: 8000 });
  const dl = await dlPromise;
  ok(dl ? "Export button downloads the ZIP" : "Export button did NOT trigger a download");

  // Archive DTA001 → badge flips to Archived + Reinstate appears
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /^Archive$/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(2000);
  body = await page.textContent("body");
  ok(body.includes("Archived") ? "after archive → 'Archived' badge shown" : "after archive → 'Archived' badge NOT shown");
  ok(body.includes("Reinstate") ? "after archive → Reinstate control present" : "after archive → Reinstate MISSING");

  // Archived company's user cannot log in (fresh context)
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await login(page2, "dta_alpha", "Test1234!");
  const url2 = page2.url();
  ok(url2.includes("/login") ? "archived-company user login DENIED (stays on /login)" : `archived-company user login NOT denied (${url2})`);

  // Reinstate → restored (fresh admin context)
  const ctx3 = await browser.newContext();
  const page3 = await ctx3.newPage();
  await login(page3, "dta_admin", "Admin1234!");
  await gotoCompanies(page3);
  page3.once("dialog", (d) => d.accept());
  await page3.getByRole("button", { name: /Reinstate/ }).first().click({ timeout: 8000 });
  await page3.waitForTimeout(2000);
  const body3 = await page3.textContent("body");
  ok(body3.includes("Active") && !body3.includes("Archived") ? "after reinstate → restored to Active (no Archived badge)" : "reinstate did not restore Active");

  // After reinstate, the same client user can login again
  const ctx4 = await browser.newContext();
  const page4 = await ctx4.newPage();
  await login(page4, "dta_alpha", "Test1234!");
  ok(!page4.url().includes("/login") ? "reinstated-company user login restored" : `reinstated-company user login still denied (${page4.url()})`);

  await browser.close();
  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("UI test errored:", e); process.exitCode = 1; });
