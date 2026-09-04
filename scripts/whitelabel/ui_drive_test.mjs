// SAMS-010 white-label theming — Browser-driven UI test (owner test plan d/e/f).
// Uses playwright-core against the system-cached Chromium, with throwaway users
// (wl_admin_a = client Admin A, wl_admin_b = client Admin B).
//   (d) set logo+colour on company A → portal header shows logo + accent;
//       company B unchanged.
//   (e) bad logo URL → silent text fallback (no broken image).
//   (f) save → reload persists; clear → reverts to SAMS default.
//
// Deterministic & network-free:
//   - GOOD logo: a LOCAL HTTPS server (self-signed cert, Chromium launched with
//     --ignore-certificate-errors) serves a real 1x1 PNG at
//     https://127.0.0.1:PORT/logo.png. This URL passes the https validation and
//     actually decodes (naturalWidth > 0), so the good path renders the <img>.
//   - BAD logo: https://127.0.0.1:PORT/not-found.png → server returns 404 → the
//     image fails to decode → silent text fallback (no broken image).
import { chromium } from "playwright-core";
import { createServer } from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3320";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const SAMS_BLUE = "rgb(30, 64, 175)"; // #1e40af
const ACCENT_A = "rgb(225, 29, 72)"; // #e11d48
const ACCENT_B = "rgb(14, 165, 233)"; // #0ea5e9
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => { if (cond) ok(m); else fail(m); };

async function login(page, username, password = "Test1234!") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

// The active nav tab carries the --brand inline background; inactive tabs are
// transparent. Read the ACTIVE tab's colour (not just the first link — on
// /portal/settings or /portal/findings the active tab is NOT the first nav item).
async function activeNavBg(page) {
  const bgs = await page.locator("header nav a").evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor)
  );
  const active = bgs.filter((bg) => bg && bg !== "rgba(0, 0, 0, 0)");
  return active.length ? active[0] : null;
}

async function main() {
  // ── Local HTTPS logo server (good = 200 PNG, bad = 404) ─────────────────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sams-wl-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${dir}/key.pem -out ${dir}/cert.pem -days 1 -nodes -subj "/CN=localhost" 2>/dev/null`);
  const PORT = 9443;
  const GOOD_LOGO = `https://127.0.0.1:${PORT}/logo.png`;
  const LOGO_B = `https://127.0.0.1:${PORT}/logo-b.png`;
  const BAD_LOGO = `https://127.0.0.1:${PORT}/not-found.png`;
  const server = createServer({ key: fs.readFileSync(`${dir}/key.pem`), cert: fs.readFileSync(`${dir}/cert.pem`) }, (req, res) => {
    if (req.url === "/logo.png" || req.url === "/logo-b.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
  });
  try {
    // ── (d) set A's logo+colour → A header shows them ──────────────────────
    const actx = await browser.newContext();
    const page = await actx.newPage();
    await login(page, "wl_admin_a");

    let body = await page.textContent("body");
    assertTrue(body.includes("Settings"), "Admin A sees the Settings nav tab");

    await page.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForSelector('input[placeholder^="https"]', { timeout: 15000 });
    body = await page.textContent("body");
    assertTrue(body.includes("Portal branding"), "settings branding card renders");
    assertTrue(body.includes("Whitelabel Alpha"), "settings card shows company A name");

    await page.locator('input[placeholder^="https"]').first().fill(GOOD_LOGO);
    await page.locator('input[type="color"]').first().fill("#e11d48");
    await page.getByRole("button", { name: "Save" }).first().click();
    await page.waitForTimeout(2500);

    await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(1800);
    const logoImgSrc = await page.locator("header img").first().getAttribute("src").catch(() => null);
    assertTrue(logoImgSrc === GOOD_LOGO, `company-A portal header shows the set logo (src=${logoImgSrc})`);
    const logoNaturalWidth = await page.locator("header img").first().evaluate((el) => el.naturalWidth).catch(() => 0);
    assertTrue(logoNaturalWidth > 0, `company-A logo actually rendered (naturalWidth=${logoNaturalWidth})`);
    const activeBg = await page.locator("header nav a").first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
    assertTrue(activeBg === ACCENT_A, `company-A portal accent = #e11d48 (bg ${activeBg})`);

    // ── Company B unchanged (no A logo/colour) ─────────────────────────────
    const bctx = await browser.newContext();
    const bpage = await bctx.newPage();
    await login(bpage, "wl_admin_b");
    await bpage.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await bpage.waitForTimeout(1800);
    body = await bpage.textContent("body");
    assertTrue(!body.includes(GOOD_LOGO) && !body.includes("alpha.example.com") && !body.includes("127.0.0.1"), "company-B header has ZERO A logo");
    const bActiveBg = await bpage.locator("header nav a").first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
    assertTrue(bActiveBg === SAMS_BLUE, `company-B accent stays SAMS blue (bg ${bActiveBg})`);
    assertTrue(body.includes("Whitelabel Beta"), "company-B portal shows B's own company");

    // ── (e) bad logo URL → silent text fallback (no broken image) ─────────
    const actx2 = await browser.newContext();
    const p2 = await actx2.newPage();
    await login(p2, "wl_admin_a");
    await p2.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await p2.waitForSelector('input[placeholder^="https"]', { timeout: 15000 });
    await p2.locator('input[placeholder^="https"]').first().fill(BAD_LOGO);
    await p2.getByRole("button", { name: "Save" }).first().click();
    await p2.waitForTimeout(2500);
    await p2.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await p2.waitForTimeout(2500);
    body = await p2.textContent("body");
    assertTrue(body.includes("Client Portal"), "bad logo URL → silent text fallback (Client Portal text shown)");
    const badImg = await p2.locator(`header img[src="${BAD_LOGO}"]`).count();
    assertTrue(badImg === 0, "no render-persistent broken image (img removed on error)");

    // ── (f) save → reload persists ────────────────────────────────────────
    await p2.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await p2.waitForSelector('input[placeholder^="https"]', { timeout: 15000 });
    await p2.locator('input[placeholder^="https"]').first().fill(GOOD_LOGO);
    await p2.locator('input[type="color"]').first().fill("#1e40af");
    await p2.getByRole("button", { name: "Save" }).first().click();
    await p2.waitForTimeout(2500);
    await p2.reload({ waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(1800);
    const persistedSrc = await p2.locator("header img").first().getAttribute("src").catch(() => null);
    assertTrue(persistedSrc === GOOD_LOGO, `save → reload persists the logo (src=${persistedSrc})`);

    // ── clear → reverts to SAMS default ────────────────────────────────────
    const clearBtn = p2.getByRole("button", { name: "Clear" }).first();
    assertTrue((await clearBtn.count()) > 0, "Clear button shown when a theme is set");
    await clearBtn.click();
    await p2.waitForTimeout(2500);
    await p2.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await p2.waitForTimeout(1800);
    body = await p2.textContent("body");
    assertTrue(body.includes("Client Portal") && !body.includes(GOOD_LOGO), "clear → reverts to SAMS default (text mark, no logo)");
    const clearedSrc = await p2.locator("header img").first().getAttribute("src").catch(() => null);
    assertTrue(clearedSrc === null || clearedSrc !== GOOD_LOGO, "no logo after clear");

    // ── (g) MULTI-COMPANY Admin — header resolves the ACTIVE company server-side ──
    // Conan round-1 finding #1: PortalHeader previously picked the active company
    // client-side as ?companyId else companies[0], so a multi-company user with a
    // home=A + UserCompany=B set, a selectedCompanyId cookie of B, and NO param,
    // got A's theme rendered on B's page. Fixture wl_admin_multi (home=A, mapped to B).
    const mctx = await browser.newContext();
    const mpage = await mctx.newPage();
    await login(mpage, "wl_admin_multi");

    // Theme A and B via the context's API (session-cookie-authenticated, param resolves the company).
    const setA = await mctx.request.patch(`${BASE}/api/portal/company/theme?companyId=cmp_wl_a`, {
      data: { logoUrl: GOOD_LOGO, primaryColor: "#e11d48" },
    });
    assertTrue(setA.ok(), "multi Admin set A's theme (200)");
    const setB = await mctx.request.patch(`${BASE}/api/portal/company/theme?companyId=cmp_wl_b`, {
      data: { logoUrl: LOGO_B, primaryColor: "#0ea5e9" },
    });
    assertTrue(setB.ok(), "multi Admin set B's theme (200)");

    // (g1) cookie=B, NO param → /portal header = B (the reproduced bug case).
    await mctx.addCookies([{ name: "selectedCompanyId", value: "cmp_wl_b", url: `${BASE}/` }]);
    await mpage.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await mpage.waitForTimeout(1800);
    const mSel = await mpage.locator('select[aria-label="Portal company"]').inputValue().catch(() => null);
    assertTrue(mSel === "cmp_wl_b", `multi B active (cookie) → selector value = B (${mSel})`);
    const mBg = await activeNavBg(mpage);
    assertTrue(mBg === ACCENT_B, `multi B active (cookie) → header accent = B #0ea5e9 (bg ${mBg})`);
    const mLogo = await mpage.locator("header img").first().getAttribute("src").catch(() => null);
    assertTrue(mLogo === LOGO_B, `multi B active (cookie) → header logo = B's logo (src=${mLogo})`);

    // (g2) param=A (though cookie is B) → header = A (param-primary, matches pages).
    await mpage.goto(`${BASE}/portal?companyId=cmp_wl_a`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await mpage.waitForTimeout(1800);
    const aBg2 = await activeNavBg(mpage);
    assertTrue(aBg2 === ACCENT_A, `multi param=A → header accent = A #e11d48 (bg ${aBg2})`);
    const aLogo2 = await mpage.locator("header img").first().getAttribute("src").catch(() => null);
    assertTrue(aLogo2 === GOOD_LOGO, `multi param=A → header logo = A's logo (src=${aLogo2})`);

    // (g3) cookie=B, /portal/settings (NO param) — the reviewer's exact repro:
    // settings card must serve B AND the header chrome must be B (not A).
    await mctx.addCookies([{ name: "selectedCompanyId", value: "cmp_wl_b", url: `${BASE}/` }]);
    await mpage.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await mpage.waitForSelector('input[placeholder^="https"]', { timeout: 15000 });
    const setBody = await mpage.textContent("body");
    assertTrue(setBody.includes("Whitelabel Beta"), "/portal/settings (cookie B) → settings card serves Beta");
    const setBg = await activeNavBg(mpage);
    assertTrue(setBg === ACCENT_B, `multi /portal/settings (cookie B) → header accent = B #0ea5e9 (bg ${setBg})`);
    const setSel = await mpage.locator('select[aria-label="Portal company"]').inputValue().catch(() => null);
    assertTrue(setSel === "cmp_wl_b", `multi /portal/settings (cookie B) → header selector = B (${setSel})`);

    // (g4) selector persistence: switch B→A via the selector (writes cookie), then
    // navigate across tabs (which drops the ?companyId param) → header stays A.
    await mpage.locator('select[aria-label="Portal company"]').selectOption("cmp_wl_a");
    await mpage.waitForTimeout(1800);
    await mpage.click('a[href="/portal/findings"]');
    await mpage.waitForTimeout(1800);
    const persistBg = await activeNavBg(mpage);
    assertTrue(persistBg === ACCENT_A, `multi selector → tab nav persists A (cookie) → header accent A (bg ${persistBg})`);
    const persistSel = await mpage.locator('select[aria-label="Portal company"]').inputValue().catch(() => null);
    assertTrue(persistSel === "cmp_wl_a", `multi selector → tab nav persists A → selector value A (${persistSel})`);

    await mctx.close();
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-010 UI test errored:", e); process.exitCode = 1; });
