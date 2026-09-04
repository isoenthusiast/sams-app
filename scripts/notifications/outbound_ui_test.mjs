// Outbound Notifications (SAMS-009) — Browser-driven UI test for the portal
// settings card (owner plan item g). Uses playwright-core against system Chromium.
//
// Drives as client-Admin A: /portal/settings → set webhook URL → masked after save
// (field cleared, status "configured ✅"); Send test → a test card arrives at the
// local receiver; Clear → status "not set". The webhook URL is never displayed.
import http from "node:http";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const UI_RECEIVER_PORT = 4001;
const UI_WEBHOOK_URL = `http://127.0.0.1:${UI_RECEIVER_PORT}/ui_a`;

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };

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
  ok(!page.url().includes("/login"), "client-Admin A logged in");

  // ── /portal/settings: set URL → masked after save ─────────────────────────
  await page.goto(`${BASE}/portal/settings`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(3000);
  let body = await page.textContent("body");
  ok(body.includes("Outbound notifications") ? "settings page renders the notifications card" : "settings card MISSING");
  ok(body.includes("not set") ? "initial status is 'not set'" : "initial status NOT 'not set'" + body.slice(0, 300));

  // Fill + Save. The field has no stable id; use the placeholder locator.
  const urlInput = page.locator('input[placeholder*="hooks.slack.com"]').first();
  ok((await urlInput.count()) >= 1, "webhook URL input present (password type)");
  await urlInput.fill(UI_WEBHOOK_URL);
  await page.locator('button:has-text("Save")').first().click();
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  ok(body.includes("configured ✅") ? "status flips to 'configured ✅' after save" : "status NOT 'configured ✅' after save");
  ok(!body.includes(UI_WEBHOOK_URL) ? "the webhook URL is NOT displayed after save (masked)" : "URL LEAKED in UI after save");
  const inputVal = await urlInput.inputValue();
  ok(inputVal === "" ? "webhook input is cleared after save (write-only)" : `webhook input NOT cleared (len ${inputVal.length})`);

  // ── Send test → card received ──────────────────────────────────────────────
  await page.locator('button:has-text("Send test")').first().click();
  await page.waitForTimeout(3000);
  body = await page.textContent("body");
  ok(body.includes("Test card delivered") ? "Send test reports 'Test card delivered'" : "Send test did NOT report delivery: " + body.slice(-200));
  ok(
    received.some((r) => r.path === "/ui_a" && JSON.stringify(r.json).includes("outbound notification test")),
    "the test card arrived at the local receiver"
  );

  // ── Clear → works ──────────────────────────────────────────────────────────
  await page.locator('button:has-text("Clear")').first().click();
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  ok(body.includes("not set") ? "status flips to 'not set' after clear" : "status NOT 'not set' after clear");
  ok(body.includes("Webhook cleared") ? "clear confirmation message shown" : "clear confirmation missing");
  ok(!body.includes(UI_WEBHOOK_URL) ? "URL never displayed after clear" : "URL LEAKED after clear");

  await browser.close();
  receiver.close();
  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("UI test errored:", e); try { receiver.close(); } catch {} process.exitCode = 1; });
