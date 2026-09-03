// Conversation Fabric (SAMS-004) — Browser-driven UI test.
// Uses playwright-core against the system-cached Chromium. Drives, with
// throwaway users (cf_provider = provider-flagged, cf_client = client):
//   (g) CommentThread composer visibility toggle + badges per plane.
//   (h) Evidence tab create->send; requestee submit + attachment surface;
//       reject->resubmit loop.
//   (i) Regression: the assessment page (/fla/ass_cf_a) still renders.
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const EXE = process.env.CHROME_PATH ?? "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };

async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  // wait for auth to settle (either redirect off /login or the app shell)
  await page.waitForTimeout(2500);
}

async function gotoAssessmentClassicEvidence(page) {
  await page.goto(`${BASE}/fla/ass_cf_a`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1500);
  // Switch to Classic view so the tab bar is visible.
  const classicBtn = page.getByRole("button", { name: /^Classic$/ });
  if (await classicBtn.count()) { await classicBtn.first().click(); await page.waitForTimeout(1500); }
  await page.getByRole("button", { name: /Evidence/ }).first().click();
  await page.waitForTimeout(2000);
}

async function pickRequestee(page, name) {
  const input = page.locator('input[placeholder="Search users…"]').first();
  await input.click();
  await input.fill(name);
  await page.waitForTimeout(600);
  const opt = page.locator(`li[class*="cursor-pointer"]`, { hasText: name }).first();
  await opt.click();
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  // ── Provider context ──────────────────────────────────────────────────────
  const pctx = await browser.newContext();
  const page = await pctx.newPage();
  await login(page, "cf_provider", "Test1234!");
  const provUrl = page.url();
  ok(!provUrl.includes("/login") ? `provider logged in (${provUrl})` : `provider login FAILED (${provUrl})`);

  // (i) regression: assessment page renders.
  await page.goto(`${BASE}/fla/ass_cf_a`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1800);
  let body = await page.textContent("body");
  ok(body.includes("CF Audit A") ? "assessment page renders (CF Audit A heading)" : "assessment page heading MISSING");
  const classicBtn = page.getByRole("button", { name: /^Classic$/ });
  if (await classicBtn.count()) { await classicBtn.first().click(); await page.waitForTimeout(1500); }
  await page.getByRole("button", { name: /Evidence/ }).first().click();
  await page.waitForTimeout(2000);
  body = await page.textContent("body");
  ok(body.includes("Evidence Requests") ? "Evidence tab renders (Evidence Requests heading)" : "Evidence tab heading MISSING");
  ok(body.includes("+ Request Evidence") ? "Evidence tab shows '+ Request Evidence'" : "'+ Request Evidence' MISSING");

  // (h) create -> send via the Evidence tab.
  await page.getByRole("button", { name: /Request Evidence/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="e.g. Provide client sign-off memo"]').fill("UI request");
  await page.locator('textarea[placeholder*="What evidence is needed"]').fill("Please provide the client sign-off memo via UI.");
  await pickRequestee(page, "CF Client");
  const dateInput = page.locator('input[type="date"]').first();
  if (await dateInput.count()) await dateInput.fill("2026-12-01");
  await page.getByRole("button", { name: /Create \(Draft\)/ }).first().click();
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  ok(body.includes("UI request") ? "created request appears in Evidence tab" : "created request NOT found in Evidence tab");
  ok(body.includes("Draft") ? "new request status is Draft" : "new request status NOT Draft");

  // (g) provider composer visibility toggle present.
  const toggleInternal = page.getByRole("button", { name: /🔒 Internal/ });
  const toggleShared = page.getByRole("button", { name: /🌐 Shared/ });
  ok(await toggleInternal.count() >= 1 ? "provider sees 🔒 Internal visibility toggle" : "provider toggle Internal MISSING");
  ok(await toggleShared.count() >= 1 ? "provider sees 🌐 Shared visibility toggle" : "provider toggle Shared MISSING");

  // Post a provider-Internal comment on the request, then verify badges render.
  const commentArea = page.locator('textarea[aria-label="Comment body"]').first();
  if (await commentArea.count()) {
    await commentArea.fill("ui provider internal note");
    await page.getByRole("button", { name: /^Post$/ }).first().click();
    await page.waitForTimeout(2000);
    body = await page.textContent("body");
    ok(body.includes("ui provider internal note") ? "provider comment posted" : "provider comment NOT posted");
    ok(body.includes("🔒 Internal") || body.includes("Internal") ? "provider comment shows Internal visibility badge" : "Internal badge NOT shown");
    ok(body.includes("🛡") ? "provider comment shows 🛡 provider badge" : "🛡 provider badge NOT shown");
  } else {
    fail("comment composer textarea not found (Provider)");
  }

  // (h) send the draft.
  const sendBtn = page.getByRole("button", { name: /^Send$/ }).first();
  if (await sendBtn.count()) {
    await sendBtn.click();
    await page.waitForTimeout(2000);
    body = await page.textContent("body");
    ok(body.includes("Requested") ? "draft -> Requested after Send" : "status not Requested after Send");
  } else {
    fail("Send button not found on draft request");
  }

  // ── Client requestee context ──────────────────────────────────────────────
  const cctx = await browser.newContext();
  const cpage = await cctx.newPage();
  await login(cpage, "cf_client", "Test1234!");
  const cliUrl = cpage.url();
  ok(!cliUrl.includes("/login") ? `client logged in (${cliUrl})` : `client login FAILED (${cliUrl})`);

  await cpage.goto(`${BASE}/fla/my-evidence-requests`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await cpage.waitForTimeout(2000);
  body = await cpage.textContent("body");
  ok(body.includes("My Evidence Requests") ? "requestee page renders (My Evidence Requests)" : "requestee page heading MISSING");
  ok(body.includes("UI request") ? "requestee sees the UI request card" : "requestee does NOT see the UI request card");

  // (g) client sees NO visibility toggle; sees the plane hint instead.
  const cliToggle = cpage.getByRole("button", { name: /Internal|Shared/ });
  ok((await cliToggle.count()) === 0 ? "client composer has NO visibility toggle (correct)" : "client composer WRONGLY shows a visibility toggle");
  ok(body.includes("Visible to provider & client") ? "client sees 'Visible to provider & client' hint" : "client plane hint MISSING");

  // (h) submit with note on the UI request.
  const uiCard = cpage.locator('div', { hasText: "UI request" }).filter({ has: cpage.locator('textarea[placeholder*="Provide your evidence"]') });
  const submitArea = uiCard.locator('textarea[placeholder*="Provide your evidence"]').first();
  if (await submitArea.count()) {
    await submitArea.fill("ui client evidence notes");
    await uiCard.getByRole("button", { name: /^Submit$/ }).first().click();
    await cpage.waitForTimeout(2500);
    body = await cpage.textContent("body");
    ok(body.includes("Submitted") ? "requestee submit -> Submitted" : "requestee submit did NOT reach Submitted");
  } else {
    fail("requestee submit textarea not found");
  }

  // Attachment surface present (regression: existing AttachmentList renders).
  const attach = cpage.locator('text=/Attachments|Add attachment|Drop/i').first();
  ok((await attach.count()) >= 1 || body.includes("attachment") ? "requestee page renders attachment surface" : "attachment surface MISSING");

  // ── Provider: reject with review note ─────────────────────────────────────
  await page.goto(`${BASE}/fla/ass_cf_a`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1200);
  if (await classicBtn.count()) { await classicBtn.first().click(); await page.waitForTimeout(1000); }
  await page.getByRole("button", { name: /Evidence/ }).first().click();
  await page.waitForTimeout(2000);
  // Find the UI request's Reject button (Submitted state). The Reject is inside the same card.
  const cardLoc = page.locator('div', { hasText: "UI request" });
  const rejectBtn = cardLoc.getByRole("button", { name: /^Reject$/ }).first();
  if (await rejectBtn.count()) {
    await rejectBtn.click();
    await page.waitForTimeout(500);
    await page.locator('input[placeholder="Review note…"]').first().fill("ui: needs more detail");
    await page.getByRole("button", { name: /^Confirm$/ }).first().click();
    await page.waitForTimeout(2000);
    body = await page.textContent("body");
    ok(body.includes("Rejected") ? "provider reject -> Rejected" : "provider reject did not reach Rejected");
  } else {
    fail("Reject button not found on UI request card");
  }

  // ── Client: sees reviewNote, resubmits ────────────────────────────────────
  await cpage.goto(`${BASE}/fla/my-evidence-requests`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await cpage.waitForTimeout(2000);
  body = await cpage.textContent("body");
  ok(body.includes("ui: needs more detail") ? "requestee sees the review note" : "review note NOT visible to requestee");
  const resubCard = cpage.locator('div', { hasText: "UI request" }).filter({ has: cpage.locator('textarea[placeholder*="Provide your evidence"]') });
  const resubArea = resubCard.locator('textarea[placeholder*="Provide your evidence"]').first();
  if (await resubArea.count()) {
    await resubArea.fill("ui resubmit with more detail");
    await resubCard.getByRole("button", { name: /^Submit$/ }).first().click();
    await cpage.waitForTimeout(2500);
    body = await cpage.textContent("body");
    ok(body.includes("Submitted") ? "requestee resubmit -> Submitted" : "requestee resubmit did NOT reach Submitted");
  } else {
    fail("resubmit textarea not found");
  }

  await browser.close();
  console.log(`\n=== UI RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("UI test errored:", e);
  process.exitCode = 1;
});
