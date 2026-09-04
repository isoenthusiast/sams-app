// Outbound Notifications (SAMS-009) — Browser-driven UI test for the portal
// settings card (owner plan item g). Uses playwright-core against system Chromium.
//
// Drives as client-Admin A: /portal/settings → set webhook URL → masked after save
// (field cleared, status "configured ✅"); Send test → a test card arrives at the
// local receiver; Clear → status "not set". The webhook URL is never displayed.
//
// NOTE: /portal/settings renders TWO cards (PortalThemeSettings + the outbound
// notifications card), each with a "Save"/"Clear" button. We scope every button
// click to the "Outbound notifications" card (via .filter({ has: h2 })) so we
// never hit the theme card's controls, and we count failures honestly (a failed
// assertion increments `failures`, it is never reported as a success).
import http from "node:http";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const UI_RECEIVER_PORT = 4001;
const UI_WEBHOOK_URL = `http://127.0.0.1:${UI_RECEIVER_PORT}/ui_a`;

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const check = (cond, okMsg, failMsg) => { checks++; if (cond) console.log("  ✓ " + okMsg); else { failures++; console.error("  ✗ FAIL: " + failMsg); } };

// ── Local receiver to prove the test card was delivered ──────────────────────
const received = [];
const receiver = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let json = null; try { json = JSON.parse(body); } catch { json = body; }
    received.push({ path: req.url, json });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});
const startReceiver = () => new Promise((r) => receiver.listen(UI_RECEIVER_PORT, "127.0.0.1", r));

async function main() {
  await startReceiver();

  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", "out_admin_a");
  await page.fill("#password", "Test1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check(!page.url().includes("/login"), "client-Admin A logged in", "login redirect did not leave /login");

  // ── /portal/settings: set URL → masked after save ─────────────────────────
  await page.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(3000);
  let body = await page.textContent("body");
  check(body.includes("Outbound notifications"), "settings page renders the notifications card", "Outbound notifications card is MISSING");
  check(body.includes("not set"), "initial status is 'not set'", "initial status NOT 'not set': " + body.slice(0, 300));

  // Scope every interaction to the outbound notifications card (there is also a
  // PortalThemeSettings card with its own Save/Clear on the same page).
  const notifCard = page.locator('div.rounded-lg').filter({ has: page.locator('h2', { hasText: 'Outbound notifications' }) });
  const urlInput = notifCard.locator('input[placeholder*="hooks.slack.com"]').first();
  check((await urlInput.count()) >= 1, "webhook URL input present (password type)", "webhook URL input MISSING");

  await urlInput.fill(UI_WEBHOOK_URL);
  await notifCard.locator('button', { hasText: 'Save' }).first().click();
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  check(body.includes("configured ✅"), "status flips to 'configured ✅' after save", "status NOT 'configured ✅' after save");
  check(!body.includes(UI_WEBHOOK_URL), "the webhook URL is NOT displayed after save (masked)", "URL LEAKED in UI after save");
  const inputVal = await urlInput.inputValue();
  check(inputVal === "", "webhook input is cleared after save (write-only)", `webhook input NOT cleared (len ${inputVal.length})`);

  // ── Send test → card received ──────────────────────────────────────────────
  await notifCard.locator('button', { hasText: 'Send test' }).first().click();
  await page.waitForTimeout(3000);
  body = await page.textContent("body");
  check(body.includes("Test card delivered"), "Send test reports 'Test card delivered'", "Send test did NOT report delivery: " + body.slice(-200));
  check(
    received.some((r) => r.path === "/ui_a" && JSON.stringify(r.json).includes("outbound notification test")),
    "the test card arrived at the local receiver",
    "test card did NOT arrive at the local receiver"
  );

  // ── Clear → works ──────────────────────────────────────────────────────────
  await notifCard.locator('button', { hasText: 'Clear' }).first().click();
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  check(body.includes("not set"), "status flips to 'not set' after clear", "status NOT 'not set' after clear");
  check(body.includes("Webhook cleared"), "clear confirmation message shown", "clear confirmation message missing");
  check(!body.includes(UI_WEBHOOK_URL), "URL never displayed after clear", "URL LEAKED after clear");

  await browser.close();
  receiver.close();
  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("UI test errored:", e); try { receiver.close(); } catch {} process.exitCode = 1; });
