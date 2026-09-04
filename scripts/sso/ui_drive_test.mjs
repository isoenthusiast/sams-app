// SAMS-012 SSO + force-password-change — Browser-driven UI test (owner test-plan
// "UI DRIVEN" gate). Uses playwright-core + the system-cached Chromium against a
// running server (BASE_URL) with throwaway fixtures from scripts/sso/run_seed.ts.
//
//   (a) force-change UI: sso_force (flagged) logs in → forced to /change-password
//       → wrong current → error → correct change → session refresh → portal
//       accessible; direct-URL bypass (/admin) → redirected back to /change-password.
//   (b) SSO button present on /login (the live IdP round-trip is landing-gated —
//       this asserts the entry point renders).
//   (c) credentials login unchanged for a non-SSO user (sso_admin) → /admin loads.
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3330";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => { if (cond) ok(m); else fail(m); };

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    // ── (b) login page shows the SSO button ────────────────────────────────
    const initCtx = await browser.newContext();
    const initPage = await initCtx.newPage();
    await initPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await initPage.waitForSelector("#username", { timeout: 15000 });
    const body = await initPage.textContent("body");
    assertTrue(body.includes("Sign in with Microsoft"), "/login renders 'Sign in with Microsoft' button");
    await initCtx.close();

    // ── (a) force-change UI ────────────────────────────────────────────────
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login as flagged user → the middleware must force /change-password.
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForSelector("#username", { timeout: 15000 });
    await page.fill("#username", "sso_force");
    await page.fill("#password", "Temp1234!");
    await page.click('button[type="submit"]');
    // Login page redirects to "/" then the proxy bounces to /change-password.
    await page.waitForURL("**/change-password", { timeout: 15000 });
    assertTrue(new URL(page.url()).pathname === "/change-password", "flagged credentials login → forced to /change-password");

    // Direct-URL bypass → redirected back to /change-password.
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForURL("**/change-password", { timeout: 15000 });
    assertTrue(new URL(page.url()).pathname === "/change-password", "direct-URL bypass (/admin) → redirected back to /change-password");

    // Wrong current → error message, stays on page.
    await page.fill("#currentPassword", "Wrong99!");
    await page.fill("#newPassword", "BrandNew12345!");
    await page.fill("#confirmPassword", "BrandNew12345!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    let bodyText = await page.textContent("body");
    assertTrue(bodyText.includes("Current password is incorrect."), "wrong current password → error shown");
    assertTrue(new URL(page.url()).pathname === "/change-password", "after wrong current → still on /change-password");

    // Correct change → session refresh → portal accessible (client-company user
    // without providerRole lands on /portal per the SAMS-005 landing rule).
    await page.fill("#currentPassword", "Temp1234!");
    await page.fill("#newPassword", "BrandNew12345!");
    await page.fill("#confirmPassword", "BrandNew12345!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);
    const afterPath = new URL(page.url()).pathname;
    assertTrue(afterPath !== "/change-password", `after correct change → left /change-password (now ${afterPath})`);
    assertTrue(afterPath === "/portal" || afterPath === "/fla" || afterPath === "/admin", `landed on a portal surface (${afterPath})`);
    bodyText = await page.textContent("body");
    assertTrue(bodyText.length > 0, "portal rendered content after change");

    // Re-verify: a fresh navigation is no longer force-gated.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(1500);
    assertTrue(new URL(page.url()).pathname !== "/change-password", "after change → GET / is NOT redirected to /change-password");
    await ctx.close();

    // ── (c) credentials unchanged — admin recovery ────────────────────────
    const actx = await browser.newContext();
    const apage = await actx.newPage();
    await apage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await apage.waitForSelector("#username", { timeout: 15000 });
    await apage.fill("#username", "sso_admin");
    await apage.fill("#password", "Admin1234!");
    await apage.click('button[type="submit"]');
    await apage.waitForTimeout(2500);
    // sso_admin is a client-company user (no providerRole) → "/" lands on /portal.
    // Admin recovery is verified by navigating the ADMIN surface directly (proxy permits role=Admin).
    await apage.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await apage.waitForTimeout(1500);
    const adminPath = new URL(apage.url()).pathname;
    assertTrue(adminPath === "/admin", `sso_admin (Admin) → /admin surface loads (${adminPath})`);
    bodyText = await apage.textContent("body");
    assertTrue(bodyText.length > 0, "/admin rendered for sso_admin");
    await actx.close();
  } finally {
    await browser.close();
  }

  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-012 UI test errored:", e); process.exitCode = 1; });
