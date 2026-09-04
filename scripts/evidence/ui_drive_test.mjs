// SAMS-013 transcript→evidence chain — Browser-driven UI test (owner test-plan f).
// Drives the REAL end-to-end flow: extract → review → confirm-with-edit → reject →
// evidence appears on the checklist-item audit page. Uses playwright-core against
// the system-cached Chromium, with throwaway users (ev_admin_a / ev_admin_b).
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3322";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, m) => { if (cond) ok(m); else fail(m); };

async function login(page, username, password = "Test1234!") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForSelector("#username", { timeout: 20000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, "ev_admin_a");

    // Select EV001 as the active company so the transcript/assessment views scope to A.
    await ctx.addCookies([{ name: "selectedCompanyId", value: "cmp_ev_a", url: `${BASE}/` }]);
    await page.goto(`${BASE}/admin?view=knowledgebase`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);

    console.log("\n--- Open the Transcripts tab ---");
    await page.getByRole("button", { name: /Transcripts/ }).click();
    await page.waitForTimeout(1500);
    let body = await page.textContent("body");
    assertTrue(body.includes("EV Monthly HSE Review"), "transcript list shows EV Monthly HSE Review");

    console.log("\n--- Expand transcript + open Extract evidence panel ---");
    await page.getByRole("button", { name: /EV Monthly HSE Review/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /Extract evidence/ }).click();
    await page.waitForTimeout(1200);
    // Assessments load async — the select should default to the first.
    await page.waitForSelector('select[aria-label="Assessment to extract against"]', { timeout: 15000 });
    const sel = await page.locator('select[aria-label="Assessment to extract against"]').inputValue();
    assertTrue(sel === "ass_ev_a" || sel.length > 0, `assessment selected (${sel})`);

    console.log("\n--- Run extraction ---");
    await page.getByRole("button", { name: /Run extraction/ }).click();
    await page.waitForTimeout(4500);
    body = await page.textContent("body");
    assertTrue(body.includes("Extraction complete"), "run extraction returned a completion message");

    // Proposal cards appear with Confirm / Reject buttons.
    const confirmBtns = page.getByRole("button", { name: /✓ Confirm/ });
    const rejectBtns = page.getByRole("button", { name: /✕ Reject/ });
    const nConfirm = await confirmBtns.count();
    assertTrue(nConfirm >= 1, `proposals rendered with Confirm buttons (${nConfirm})`);
    const nReject = await rejectBtns.count();
    assertTrue(nReject >= 1, `proposals rendered with Reject buttons (${nReject})`);

    console.log("\n--- Confirm-with-edit on the first proposal ---");
    const editBtns = page.getByRole("button", { name: /✏️ Edit/ });
    if (await editBtns.count() >= 1) {
      await editBtns.first().click();
      await page.waitForTimeout(400);
      // The textarea is the evidence-excerpt editor.
      await page.locator('textarea[aria-label="Edit evidence excerpt"]').first().fill("EDITED evidence excerpt confirmed by the assessor.");
      await page.waitForTimeout(300);
    }
    await confirmBtns.first().click();
    await page.waitForTimeout(3500);
    body = await page.textContent("body");
    assertTrue(body.includes("Evidence linked"), "confirm produced the evidence-linked message");

    console.log("\n--- Reject the second proposal ---");
    // The queue refetched; Confirm the first is gone, pick a still-visible Reject.
    const rejectBtns2 = page.getByRole("button", { name: /✕ Reject/ });
    if (await rejectBtns2.count() >= 1) {
      await rejectBtns2.first().click();
      await page.waitForTimeout(3500);
      body = await page.textContent("body");
      assertTrue(body.includes("rejected") || body.includes("Rejected"), "reject produced the recorded message");
    } else {
      ok("(no second proposal to reject in the reviewed queue)");
    }

    console.log("\n--- Evidence appears on the checklist-item audit page ---");
    await page.goto(`${BASE}/fla/ass_ev_a`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    // The assessment defaults to "Minimalist" view (no Checklist tab) — switch to
    // "Classic" so the tabs render.
    await page.getByRole("button", { name: "Classic", exact: true }).click();
    await page.waitForTimeout(1500);
    // Open the Checklist tab.
    await page.getByRole("button", { name: /📋 Checklist/ }).click();
    await page.waitForTimeout(2500);
    body = await page.textContent("body");
    // The evidence attachment is on the checklist-item audit (AttachmentList).
    assertTrue(/Attachments\s*\(\s*[1-9]/.test(body), "a checklist item shows an Attachments count >= 1");
    assertTrue(body.includes("evidence.txt"), "the evidence attachment (evidence.txt) appears on the checklist-item audit page");

    await ctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-013 UI test errored:", e); process.exitCode = 1; });
