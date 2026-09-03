import { chromium } from "playwright-core";
const BASE = "http://localhost:3100";
const EXE = "/home/edward/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.fill("#username", "dta_admin");
  await page.fill("#password", "Admin1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log("after login url:", page.url());
  await page.goto(`${BASE}/admin?view=sysadmin`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Companies/ }).first().click();
  await page.waitForTimeout(2000);
  const body = await page.textContent("body");
  console.log("has Archive:", body.includes("Archive"), "| Active:", body.includes("Active"), "| Reinstate:", body.includes("Reinstate"), "| Export:", body.includes("Export"), "| Data Trust Alpha:", body.includes("Data Trust Alpha"));
  console.log("snippet:", body.replace(/\s+/g," ").slice(0, 300));
  await browser.close();
  console.log("done");
})().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; });
