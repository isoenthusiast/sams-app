// SAMS-011 public read-only API — Browser-driven UI test for the portal Settings
// page's "Public read-only API" card (settled decision #5, client Admin).
// Run against a built server (npm start) + throwaway DB seeded with
// scripts/public-api/seed.ts. Uses playwright-core + the system Chromium.
//
//   (a) /portal/settings (client Admin A) renders the "Public read-only API" card.
//   (b) create a key via the card → the show-once box appears with a sams_pub_
//       plaintext.
//   (c) the new key appears in the list with label + Active status.
//   (d) revoke it → the list row flips to Revoked.
//   (e) the card does NOT render any key material in the list (only labels/dates).
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3321";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => { if (cond) ok(m); else fail(m); };

async function login(page, username, password = "Test1234!") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, "pa_admin_a");

    await page.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForSelector("text=Public read-only API", { timeout: 15000 });
    let body = await page.textContent("body");
    assertTrue(body.includes("Public read-only API"), "(a) settings page renders the API key card");
    assertTrue(body.includes("Public Alpha"), "(a) card shows company A (Public Alpha)");

    // (b) create a key via the card
    const label = `UI test key ${Date.now()}`;
    await page.fill('input[placeholder*="Power BI"]', label);
    await page.getByRole("button", { name: "Create key" }).click();
    await page.waitForSelector("text=New API key", { timeout: 15000 });
    body = await page.textContent("body");
    assertTrue(/sams_pub_[A-Za-z0-9_-]{20,}/.test(body), "(b) show-once box appears with a sams_pub_ plaintext");
    assertTrue(body.includes(label), "(b) show-once box echoes the label");

    // (c) the new key appears in the list
    await page.waitForTimeout(1200);
    body = await page.textContent("body");
    assertTrue(body.includes(label), "(c) new key appears in the list with its label");
    assertTrue(body.includes("Active"), "(c) the new key row shows Active");

    // (e) list shows NO key material (only meta)
    assertTrue(!body.includes("keyHash") && !body.includes("passwordHash"), "(e) list never shows keyHash/passwordHash");

    // (d) revoke it
    const row = page.locator("li", { hasText: label });
    page.once("dialog", (d) => d.accept()); // accept the browser confirm BEFORE clicking
    await row.getByRole("button", { name: "Revoke" }).click();
    await page.waitForTimeout(2000);
    body = await page.textContent("body");
    assertTrue(body.includes("Revoked"), "(d) the key row flips to Revoked after revoke");
  } finally {
    await browser.close();
  }
  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) { console.error("SAMS-011 UI TEST FAILED."); process.exitCode = 1; }
  else { console.log("SAMS-011 UI TEST PASSED."); }
}

main().catch((e) => { console.error("SAMS-011 UI test errored:", e); process.exitCode = 1; });
