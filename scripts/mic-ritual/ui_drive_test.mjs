// MIC Ritual (SAMS-014) — Browser-driven UI test for the attest flow.
// Run against a built server (npm start, PORT=3200) + the throwaway DB.
// Re-seeds fresh (so paA2 is DERIVED overdue) then:
//   (f) the processdetails page shows the SOC Attestation card with an OVERDUE chip;
//       click "✍ Attest" -> the modal fetches and shows the SERVER-COMPUTED snapshot
//       (coverage %, open findings, overdue actions); click "Sign & attest" -> success;
//       the chip FLIPS to Attested (server state refresh).
// Uses playwright-core + the system Chromium.
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
  // Re-seed fresh so paA2 is overdue (clean flip demonstration).
  execSync("npx tsx scripts/mic-ritual/seed.ts", { stdio: "inherit" });

  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, "mic_admin_a");

    // (f) processdetails shows the SOC Attestation card + OVERDUE chip.
    await page.goto(`${BASE}/setup/processdetails/pa_mic_a2`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForSelector("text=SOC Attestation", { timeout: 15000 });
    let body = await page.textContent("body");
    assertTrue(body.includes("SOC Attestation"), "(f) processdetails renders the SOC Attestation card");
    assertTrue(body.includes("Overdue"), "(f) fresh paA2 shows the Overdue chip");

    // Open the attest modal.
    const attestBtn = page.getByRole("button", { name: "Attest" }).first();
    await attestBtn.click();
    await page.waitForSelector("text=Coverage (full comply)", { timeout: 15000 });
    body = await page.textContent("body");
    assertTrue(body.includes("Coverage (full comply)"), "(f) modal shows the server-computed coverage metric");
    assertTrue(body.includes("Open findings"), "(f) modal shows the open-findings metric");
    assertTrue(body.includes("Overdue actions"), "(f) modal shows the overdue-actions metric");
    assertTrue(body.includes("33%"), "(f) modal shows the server-computed 33% coverage (not 99%)");

    // Sign.
    await page.getByRole("button", { name: "Sign & attest" }).click();
    await page.waitForSelector("text=Attestation signed", { timeout: 15000 });
    body = await page.textContent("body");
    assertTrue(body.includes("Attestation signed"), "(f) sign succeeds");
    await page.waitForTimeout(1500);

    // Chip flips to Attested (server state refreshed).
    body = await page.textContent("body");
    assertTrue(body.includes("Attested"), "(f) the chip FLIPS to Attested after signing");

    // Sanity: the overdue PA (paA1) still renders its card/status (soft — nothing blocked).
    await page.goto(`${BASE}/setup/processdetails/pa_mic_a1`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForSelector("text=SOC Attestation", { timeout: 15000 });
    body = await page.textContent("body");

    console.log("\n=== UI: attest flow driven end-to-end ===");
  } finally {
    await browser.close();
  }
  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) { console.error("MIC UI TEST FAILED."); process.exitCode = 1; }
  else { console.log("MIC UI TEST PASSED."); }
}

main().catch((e) => { console.error("MIC UI test errored:", e); process.exitCode = 1; });
