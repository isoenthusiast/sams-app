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

async function main() {
  // ── Local HTTPS logo server (good = 200 PNG, bad = 404) ─────────────────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sams-wl-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${dir}/key.pem -out ${dir}/cert.pem -days 1 -nodes -subj "/CN=localhost" 2>/dev/null`);
  const PORT = 9443;
  const GOOD_LOGO = `https://127.0.0.1:${PORT}/logo.png`;
  const BAD_LOGO = `https://127.0.0.1:${PORT}/not-found.png`;
  const server = createServer({ key: fs.readFileSync(`${dir}/key.pem`), cert: fs.readFileSync(`${dir}/cert.pem`) }, (req, res) => {
    if (req.url === "/logo.png") {
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
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-010 UI test errored:", e); process.exitCode = 1; });
