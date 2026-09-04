// Outbound Notifications (SAMS-009, Phase 3a Feature B) — FUNCTIONAL test runner.
//
// Run against a BUILT server (npm start, PORT=3200) pointed at the throwaway DB
// seeded by scripts/notifications/seed_outbound.ts, with CRON_SECRET set on the
// server. This file: (1) starts a local webhook receiver on :3999 (recording
// {path, body}), then drives the flows through HTTP + DB assertions.
//
// Owner test plan trust items covered:
//   (a) evidence-request send -> company webhook receives {text} + delivery=sent
//   (b) unreachable endpoint -> delivery=failed AND in-app notification still written
//   (c) sweep: seed action overdue -> summary post + in-app to client Admin;
//       both cron routes 401 without CRON_SECRET
//   (d) digest post contains SOC% + new-findings + overdue + open-requests counts
//   (e) secret-scan: webhook URL absent from exports/API responses/ActivityLog/
//       digest post bodies; cross-tenant: company A events never reach /nh_b
//   (f) clear URL -> no further posts
import http from "node:http";
import { prisma } from "@/lib/prisma";
import { buildExportPackage } from "@/lib/data-trust-export";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const RECEIVER_PORT = 3999;
const CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";
const WEBHOOK_URL_A = "http://127.0.0.1:3999/nh_a";
const UNREACHABLE_URL = "http://127.0.0.1:9/unreachable";

const IDS = {
  a: "cmp_out_a",
  b: "cmp_out_b",
  client: "usr_out_client",
  provider: "usr_out_provider",
  adminA: "usr_out_admin_a",
  adminB: "usr_out_admin_b",
  assessmentA: "ass_out_a",
  overdueAction: "act_out_overdue",
  clientName: "out_client",
  providerName: "out_provider",
  adminAName: "out_admin_a",
};

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (cond, msg) => { if (cond) ok(msg); else fail(msg); };
const assertEq = (actual, expected, msg) => { if (actual === expected) ok(`${msg} (= ${expected})`); else fail(`${msg}: expected ${expected}, got ${actual}`); };

// ── Local webhook receiver ─────────────────────────────────────────────────
const received = []; // { path, json }
const receiver = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let json = null;
    try { json = JSON.parse(body); } catch { json = body; }
    received.push({ path: req.url, json, method: req.method });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});
function startReceiver() { return new Promise((resolve) => receiver.listen(RECEIVER_PORT, "127.0.0.1", resolve)); }
function got(path, needle) {
  return received.some((r) => r.path === path && (needle ? JSON.stringify(r.json).includes(needle) : true));
}
function count(path) { return received.filter((r) => r.path === path).length; }

// ── HTTP helpers ───────────────────────────────────────────────────────────
class Jar {
  constructor() { this.map = new Map(); }
  set(sc) { if (!sc) return; const s = Array.isArray(sc) ? sc : [sc]; for (const c of s) { const p = c.split(";")[0].split("="); if (p.length >= 2) this.map.set(p[0].trim(), decodeURIComponent(p.slice(1).join("="))); } }
  header() { return [...this.map].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "); }
}
async function fetchWithManual(url, opts = {}, jar) {
  const headers = new Headers(opts.headers || {});
  if (jar) headers.set("cookie", jar.header());
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  if (jar && res.headers.getSetCookie) jar.set(res.headers.getSetCookie());
  return res;
}
async function login(username, password) {
  const jar = new Jar();
  const csrf = (await (await fetchWithManual(`${BASE}/api/auth/csrf`, { method: "GET" }, jar)).json().catch(() => ({})))?.csrfToken;
  if (!csrf) return { ok: false, jar };
  await fetchWithManual(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf, username, password, json: "true" }).toString() }, jar);
  const sess = await (await fetchWithManual(`${BASE}/api/auth/session`, { method: "GET" }, jar)).json().catch(() => ({}));
  return { ok: !!(sess?.user), jar };
}

async function main() {
  await startReceiver();
  console.log(`\n=== Outbound Notifications functional test against ${BASE} ===`);

  console.log("\n[0] Logins + receiver sanity");
  const provider = await login("out_provider", "Test1234!");
  const adminA = await login("out_admin_a", "Test1234!");
  assertTrue(provider.ok, "provider logged in");
  assertTrue(adminA.ok, "client-Admin A logged in");

  console.log("\n[a] Evidence-request send -> company webhook receives {text} + delivery=sent");
  const sendRes = await fetchWithManual(`${BASE}/api/evidence-requests/er_out_draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) }, provider.jar);
  assertEq(sendRes.status, 200, "patch send -> 200");
  assertTrue(got("/nh_a", "Evidence requested"), "company A webhook received a {text} Evidence-requested card");
  assertTrue(!got("/nh_b"), "company B webhook received NOTHING (cross-tenant safe)");
  const delA = await prisma.notificationDelivery.findFirst({ where: { companyId: IDS.a, status: "sent" }, orderBy: { attemptedAt: "desc" } });
  assertTrue(!!delA, "a NotificationDelivery row exists for company A");
  assertEq(delA?.status, "sent", "delivery status = sent");
  assertTrue(delA?.responseCode === 200, "delivery responseCode = 200");
  await new Promise((r) => setTimeout(r, 300)); // allow emission durability

  console.log("\n[b] Unreachable endpoint -> delivery=failed AND in-app notification still written");
  await prisma.company.update({ where: { id: IDS.a }, data: { notificationWebhookUrl: UNREACHABLE_URL } });
  const create2 = await fetchWithManual(`${BASE}/api/evidence-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Failed endpoint req", instructions: "x", requestedFromUserId: IDS.client, assessmentId: IDS.assessmentA }) }, provider.jar);
  const er2 = (await create2.json()).evidenceRequest?.id;
  assertTrue(!!er2, "created a second (failed-endpoint) request");
  await fetchWithManual(`${BASE}/api/evidence-requests/${er2}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) }, provider.jar);
  await new Promise((r) => setTimeout(r, 300));
  const delFail = await prisma.notificationDelivery.findFirst({ where: { companyId: IDS.a, status: "failed" }, orderBy: { attemptedAt: "desc" } });
  assertTrue(!!delFail, "a delivery=failed row was recorded for the unreachable endpoint");
  assertEq(delFail?.responseCode, null, "failed delivery has responseCode null (could not connect)");
  const inApp = await prisma.notification.findFirst({ where: { entityId: er2, type: "EvidenceRequested" } });
  assertTrue(!!inApp, "in-app notification still written despite the webhook failure (fault containment)");

  console.log("\n[c] Sweep: 401 without CRON_SECRET; summary post + in-app to client Admin with it");
  // Reset company A's webhook to the live receiver so the sweep post is observable.
  await prisma.company.update({ where: { id: IDS.a }, data: { notificationWebhookUrl: WEBHOOK_URL_A } });
  const beforeA = count("/nh_a");
  const noSecret1 = await fetchWithManual(`${BASE}/api/cron/notify-sweep`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assertEq(noSecret1.status, 401, "notify-sweep without CRON_SECRET -> 401");
  const noSecret2 = await fetchWithManual(`${BASE}/api/cron/weekly-digest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assertEq(noSecret2.status, 401, "weekly-digest without CRON_SECRET -> 401");
  const sweep = await fetchWithManual(`${BASE}/api/cron/notify-sweep`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` }, body: JSON.stringify({}) });
  assertEq(sweep.status, 200, "notify-sweep with CRON_SECRET -> 200");
  const sweepJson = await sweep.json();
  assertTrue(sweepJson.actions >= 1, `sweep reported ${sweepJson.actions} newly-overdue action(s)`);
  assertTrue(got("/nh_a", "overdue"), "company A webhook received the overdue sweep summary card");
  const adminANotifs = await prisma.notification.count({ where: { recipientUserId: IDS.adminA, type: "ActionOverdue" } });
  assertTrue(adminANotifs >= 1, `client-Admin A has an in-app ActionOverdue notification (count ${adminANotifs})`);

  console.log("\n[d] Weekly digest -> SOC%/new-findings/overdue/open-requests counts");
  const digest = await fetchWithManual(`${BASE}/api/cron/weekly-digest`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` }, body: JSON.stringify({}) });
  assertEq(digest.status, 200, "weekly-digest -> 200");
  const digestJson = await digest.json();
  assertEq(digestJson.posted, 2, "digest posted to BOTH subscribed companies (A + B)");
  assertTrue(got("/nh_a", "Weekly assurance digest") && got("/nh_a", "SOC coverage"), "company A digest contains SOC coverage");
  assertTrue(got("/nh_a", "New findings") && got("/nh_a", "Overdue actions") && got("/nh_a", "Open evidence requests"), "company A digest contains new-findings/overdue/open-requests");
  assertTrue(got("/nh_b", "Weekly assurance digest"), "company B digest posted");
  assertTrue(!got("/nh_a", WEBHOOK_URL_A), "digest body does NOT contain the webhook URL (secret-scan)");

  console.log("\n[e] Secret-scan: URL absent from exports + API responses + ActivityLog");
  const pkg = await buildExportPackage(IDS.a);
  // The URL value must never appear anywhere in the package; the column header
  // must never appear in an actual CSV data file (manifest.json legitimately
  // lists the exclusion name in its exclusionList — that is not a leak).
  for (const e of pkg.entries) {
    if (e.file === "manifest.json") continue;
    const csv = e.content.toLowerCase();
    assertTrue(!csv.includes(WEBHOOK_URL_A.toLowerCase()), `[${e.file}] export does NOT contain the webhook URL value`);
    assertTrue(!csv.includes("notificationwebhookurl"), `[${e.file}] export has NO notificationWebhookUrl column`);
  }
  const blobAll = pkg.entries.map((e) => e.content).join("\n");
  assertTrue(!blobAll.includes(WEBHOOK_URL_A), "no export entry contains the webhook URL value");
  const settingsGet = await fetchWithManual(`${BASE}/api/portal/notifications-settings`, { method: "GET" }, adminA.jar);
  const sg = await settingsGet.json();
  assertTrue(!JSON.stringify(sg).includes(WEBHOOK_URL_A), "GET notifications-settings response does NOT contain the URL (masked)");
  assertEq(sg.configured, true, "settings GET reports configured=true (masked)");
  const logHit = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "ActivityLog" WHERE
       COALESCE(("afterData")::text,'') LIKE '%' || $1 || '%'
       OR COALESCE(("beforeData")::text,'') LIKE '%' || $1 || '%'
       OR COALESCE(("description")::text,'') LIKE '%' || $1 || '%'`,
    WEBHOOK_URL_A
  );
  assertEq(Number(logHit[0].c), 0, "ActivityLog contains ZERO references to the webhook URL");

  console.log("\n[f] Clear URL -> no further posts");
  const clear = await fetchWithManual(`${BASE}/api/portal/notifications-settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }, adminA.jar);
  const clearJson = await clear.json();
  assertEq(clear.status, 200, "clear webhook -> 200");
  assertEq(clearJson.configured, false, "clear -> configured=false");
  const beforeClr = count("/nh_a");
  const delsBefore = await prisma.notificationDelivery.count({ where: { companyId: IDS.a } });
  const create3 = await fetchWithManual(`${BASE}/api/evidence-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "After clear req", instructions: "x", requestedFromUserId: IDS.client, assessmentId: IDS.assessmentA }) }, provider.jar);
  const er3 = (await create3.json()).evidenceRequest?.id;
  await fetchWithManual(`${BASE}/api/evidence-requests/${er3}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) }, provider.jar);
  await new Promise((r) => setTimeout(r, 300));
  assertEq(count("/nh_a"), beforeClr, "no further webhook post after clear (count unchanged)");
  const delsAfter = await prisma.notificationDelivery.count({ where: { companyId: IDS.a } });
  assertEq(delsAfter, delsBefore, "no delivery row created after clear (no URL -> no post)");

  receiver.close();
  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Outbound functional test errored:", e); try { receiver.close(); } catch {} process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
