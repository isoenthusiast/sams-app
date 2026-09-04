// SAMS-016 (Master Content Roll-Forward) — Browser-driven UI test (owner DoD (f)).
// Runs against a built server (npm start, PORT=3200) + the throwaway DB.
// Re-seeds fresh (RF001 at v1), then drives:
//   operator: publish new pack -> per-client "Content v1 · update v2" ->
//             Review diff (added/changed/conflict/removed) -> Adopt -> "Content v2".
//   client:   portal banner "Content baseline updated v1→v2" -> Acknowledge ->
//             banner dismisses, persists across re-login.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
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
  execSync("npx tsx scripts/content-rollforward/seed.ts", { stdio: "inherit" });

  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    // ── Operator: publish -> per-client version -> review diff -> adopt ──
    const opCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const op = await opCtx.newPage();
    await login(op, "rf_provider");
    await op.goto(`${BASE}/operator`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await op.waitForSelector("text=Operator Console", { timeout: 15000 });
    await op.waitForSelector("text=＋ Publish new pack", { timeout: 15000 });
    await op.getByRole("button", { name: "Publish new pack" }).click();
    // Wait until the RF001 row reports an update is available (publish + reload done).
    await op.waitForSelector("text=update v2", { timeout: 20000 });
    let body = await op.textContent("body");
    assertTrue(body.includes("Content v1"), "(f) operator sees Content v1 on RF001");
    assertTrue(body.includes("update v2"), "(f) operator sees update available v2");

    // Target the RF001 row specifically (the seed creates several client
    // companies, so `.first()` would adopt the wrong one — DTA002).
    const rfRow = op.locator("tr", { hasText: "RF001" }).first();
    await rfRow.getByRole("button", { name: "Review diff" }).click();
    await op.waitForSelector("text=Content diff v1 → v2", { timeout: 15000 });
    body = await op.textContent("body");
    assertTrue(body.includes("Added: 5"), "(f) diff preview shows Added: 5");
    assertTrue(body.includes("Changed: 1"), "(f) diff preview shows Changed: 1");
    assertTrue(body.includes("Conflicts: 1"), "(f) diff preview shows Conflicts: 1");
    assertTrue(body.includes("Removed: 2"), "(f) diff preview shows Removed: 2");

    await op.getByRole("button", { name: "Adopt", exact: true }).click();
    await op.waitForTimeout(2500);
    body = await op.textContent("body");
    assertTrue(body.includes("Content v2"), "(f) operator row flips to Content v2 after adopt");
    await opCtx.close();

    // ── Client (separate context): portal banner -> acknowledge -> dismissed, persists ──
    const cliCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const client = await cliCtx.newPage();
    await login(client, "rf_admin");
    await client.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await client.waitForSelector("text=Content baseline updated v1→v2", { timeout: 15000 });
    body = await client.textContent("body");
    assertTrue(body.includes("Content baseline updated v1→v2"), "(f) client portal shows the content-baseline banner");
    await client.getByRole("button", { name: "Acknowledge" }).click();
    await client.waitForTimeout(1200);
    body = await client.textContent("body");
    assertTrue(!body.includes("Content baseline updated v1→v2"), "(f) banner dismisses after acknowledge");

    // Re-login (FRESH context = clean session, so /login actually shows the form)
    // -> banner stays dismissed (the acknowledgment is persisted in the DB).
    const reCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const re = await reCtx.newPage();
    await login(re, "rf_admin");
    await re.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await re.waitForTimeout(1500);
    body = await re.textContent("body");
    assertTrue(!body.includes("Content baseline updated v1→v2"), "(f) banner stays dismissed after re-login");
    await reCtx.close();
    await cliCtx.close();

    console.log("\n=== UI: publish -> diff -> adopt -> banner acknowledge driven end-to-end ===");
  } finally {
    await browser.close();
  }
  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) { console.error("SAMS-016 UI TEST FAILED."); process.exitCode = 1; }
  else { console.log("SAMS-016 UI TEST PASSED."); }
}

main().catch((e) => { console.error("SAMS-016 UI test errored:", e); process.exitCode = 1; });
