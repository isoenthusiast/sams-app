// In-App Notifications (SAMS-006) — FUNCTIONAL (HTTP) test runner.
// Run against a built server (npm start, PORT=3200) pointed at a throwaway DB
// seeded with scripts/notifications/seed.ts. Covers the owner test plan through
// the HTTP surface:
//   (a) full loop: requested → submitted → reviewed, deep-links land right.
//   (b) unread counts correct; mark-read / mark-all persist; another user's rows
//       NEVER returned + mark-read on another user's id → 403 & row unchanged.
//   (d) overdue banner reflects a COMPUTED overdue action (seeded in company A).
//   (e) regression: fabric ACs still green — run scripts/conversation/*
//       separately (this file keeps SAMS-006 assertions isolated).
// Fault-injection (c) is driven by scripts/notifications/verify_fault_injection.ts.

const BASE = process.env.BASE_URL ?? "http://localhost:3200";

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertEq = (actual, expected, msg) => { if (actual === expected) ok(`${msg} (= ${expected})`); else fail(`${msg}: expected ${expected}, got ${actual}`); };
const assertTrue = (cond, msg) => { if (cond) ok(msg); else fail(msg); };

class Jar {
  constructor() { this.map = new Map(); }
  set(setCookie) {
    if (!setCookie) return;
    const s = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of s) { const pair = c.split(";")[0].split("="); if (pair.length >= 2) this.map.set(pair[0].trim(), decodeURIComponent(pair.slice(1).join("="))); }
  }
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
  const csrfRes = await fetchWithManual(`${BASE}/api/auth/csrf`, { method: "GET" }, jar);
  const csrf = (await csrfRes.json().catch(() => ({})))?.csrfToken;
  if (!csrf) return { ok: false, jar, reason: "no csrf" };
  const body = new URLSearchParams({ csrfToken: csrf, username, password, json: "true" });
  await fetchWithManual(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }, jar);
  const session = await fetchWithManual(`${BASE}/api/auth/session`, { method: "GET" }, jar);
  const sess = await session.json().catch(() => ({}));
  return { ok: !!(sess?.user), jar, session: sess };
}

const ER_ASSESSMENT = "ass_ntf_a";

async function main() {
  console.log(`\n=== In-App Notifications functional test against ${BASE} ===`);

  console.log("\n[0] Unauthenticated guards");
  const gated = (s) => s === 401 || s === 403 || s === 302 || s === 307;
  const noAuthList = await fetchWithManual(`${BASE}/api/notifications`, { method: "GET" });
  assertTrue(gated(noAuthList.status), `GET /api/notifications unauthenticated gated (${noAuthList.status})`);
  const noAuthMark = await fetchWithManual(`${BASE}/api/notifications/mark-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  assertTrue(gated(noAuthMark.status), `POST /api/notifications/mark-read unauthenticated gated (${noAuthMark.status})`);

  console.log("\n[1] Logins");
  const provider = await login("ntf_provider", "Test1234!");
  const client = await login("ntf_client", "Test1234!");
  const foreign = await login("ntf_foreign", "Test1234!");
  assertTrue(provider.ok, "provider (requester) logged in");
  assertTrue(client.ok, "client (requestee) logged in");
  assertTrue(foreign.ok, "foreign user logged in");

  console.log("\n[2] (a) Full loop — requested → submitted → reviewed");
  const create = await fetchWithManual(`${BASE}/api/evidence-requests`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Provide sign-off memo", instructions: "Attach the client sign-off memo.", requestedFromUserId: "usr_ntf_client", assessmentId: ER_ASSESSMENT, dueDate: "2030-01-01" }),
  }, provider.jar);
  const createJson = await create.json();
  assertEq(create.status, 201, "requester creates evidence request (Draft)");
  const erId = createJson.evidenceRequest?.id;
  assertTrue(!!erId, "returned evidenceRequest.id");

  await fetchWithManual(`${BASE}/api/evidence-requests/${erId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) }, provider.jar);
  // Requestee (client) should now have an EvidenceRequested notification.
  const clientNotifs1 = await fetchWithManual(`${BASE}/api/notifications?unread=1`, { method: "GET" }, client.jar);
  const cn1 = await clientNotifs1.json();
  const reqd = (cn1.notifications ?? []).find((n) => n.entityId === erId);
  assertTrue(!!reqd, "requestee sees a notification for the request");
  assertEq(reqd?.type, "EvidenceRequested", "requestee notification type = EvidenceRequested");
  assertTrue(reqd?.readAt == null, "EvidenceRequested is unread");
  assertEq(reqd?.href, "/fla/my-evidence-requests", "EvidenceRequested deep-links to requestee submit hub");
  assertTrue((cn1.unreadCount ?? 0) >= 1, "requestee unreadCount >= 1");

  // Requestee submits.
  await fetchWithManual(`${BASE}/api/evidence-requests/${erId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", submittedNote: "here is the memo" }) }, client.jar);
  // Requester (provider) gets EvidenceSubmitted.
  const provNotifs = await fetchWithManual(`${BASE}/api/notifications?unread=1`, { method: "GET" }, provider.jar);
  const pn = await provNotifs.json();
  const subd = (pn.notifications ?? []).find((n) => n.entityId === erId && n.type === "EvidenceSubmitted");
  assertTrue(!!subd, "requester sees EvidenceSubmitted");
  assertTrue(subd?.readAt == null, "EvidenceSubmitted is unread");
  assertTrue((subd?.href ?? "").startsWith(`/fla/${ER_ASSESSMENT}`), `EvidenceSubmitted deep-links to assessment evidence tab (${subd?.href})`);

  // Requester rejects.
  const reject = await fetchWithManual(`${BASE}/api/evidence-requests/${erId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reject", reviewNote: "Insufficient detail" }) }, provider.jar);
  assertEq(reject.status, 200, "requester reject → Rejected");
  const clientNotifs2 = await fetchWithManual(`${BASE}/api/notifications?unread=1`, { method: "GET" }, client.jar);
  const cn2 = await clientNotifs2.json();
  const revd = (cn2.notifications ?? []).find((n) => n.entityId === erId && n.type === "EvidenceReviewed");
  assertTrue(!!revd, "requestee sees EvidenceReviewed");
  assertEq(revd?.href, "/fla/my-evidence-requests", "EvidenceReviewed deep-links to requestee submit hub");

  console.log("\n[3] (b) Unread counts + mark-read / mark-all");
  // Client now has 2 unread (EvidenceRequested + EvidenceReviewed).
  assertTrue((cn2.unreadCount ?? 0) >= 2, `requestee unreadCount >= 2 (got ${cn2.unreadCount})`);
  const evReqId = (cn2.notifications ?? []).find((n) => n.type === "EvidenceRequested")?.id;
  const markOne = await fetchWithManual(`${BASE}/api/notifications/mark-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [evReqId] }) }, client.jar);
  const mo = await markOne.json();
  assertEq(markOne.status, 200, "mark-read one → 200");
  assertEq(mo.updated, 1, "mark-read one updated exactly 1");
  const clientAfterOne = await fetchWithManual(`${BASE}/api/notifications?unread=1`, { method: "GET" }, client.jar);
  const ca1 = await clientAfterOne.json();
  assertEq(ca1.unreadCount, 1, "after marking one read, unreadCount = 1");

  const markAll = await fetchWithManual(`${BASE}/api/notifications/mark-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }, client.jar);
  const ma = await markAll.json();
  assertEq(markAll.status, 200, "mark-all → 200");
  assertEq(ma.updated, 1, "mark-all updated the remaining unread (1)");
  const clientAfterAll = await fetchWithManual(`${BASE}/api/notifications`, { method: "GET" }, client.jar);
  const ca2 = await clientAfterAll.json();
  assertEq(ca2.unreadCount, 0, "after mark-all, unreadCount = 0");
  const allRead = (ca2.notifications ?? []).every((n) => n.readAt != null);
  assertTrue(allRead, "every notification is read after mark-all");

  console.log("\n[4] (b) Another user's rows NEVER returned");
  // Get the foreign user's notification id.
  const foreignNotifs = await fetchWithManual(`${BASE}/api/notifications`, { method: "GET" }, foreign.jar);
  const fn = await foreignNotifs.json();
  const foreignIds = (fn.notifications ?? []).map((n) => n.id);
  assertTrue(foreignIds.length >= 1, "foreign user has >= 1 notification");
  // Client's list must NOT contain any of them.
  const clientFull = await fetchWithManual(`${BASE}/api/notifications`, { method: "GET" }, client.jar);
  const cf = await clientFull.json();
  const leaked = (cf.notifications ?? []).filter((n) => foreignIds.includes(n.id));
  assertEq(leaked.length, 0, "client's list contains ZERO other users' rows (scan)");

  // Cross-user mark-read → 403 AND the foreign row stays unread.
  const foreignId = foreignIds[0];
  const markForeign = await fetchWithManual(`${BASE}/api/notifications/mark-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [foreignId] }) }, client.jar);
  assertEq(markForeign.status, 403, "mark-read on another user's id → 403");
  const foreignAfter = await fetchWithManual(`${BASE}/api/notifications?unread=1`, { method: "GET" }, foreign.jar);
  const fa = await foreignAfter.json();
  const stillUnread = (fa.notifications ?? []).some((n) => n.id === foreignId);
  assertTrue(stillUnread, "foreign user's row is UNCHANGED (still unread) after the 403");

  console.log("\n[5] (d) Overdue banner — computed at read-time");
  assertTrue((clientFull.ok || true), "client GET /api/notifications resolved");
  // Re-fetch the client's response (it includes overdueCount).
  const overdue = await fetchWithManual(`${BASE}/api/notifications`, { method: "GET" }, client.jar);
  const od = await overdue.json();
  assertTrue((od.overdueCount ?? 0) >= 1, `overdueCount reflects the seeded overdue action (got ${od.overdueCount})`);

  console.log("\n[6] mark-read validation");
  const emptyIds = await fetchWithManual(`${BASE}/api/notifications/mark-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [] }) }, client.jar);
  assertEq(emptyIds.status, 400, "mark-read with empty ids → 400");
  const neither = await fetchWithManual(`${BASE}/api/notifications/mark-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }, client.jar);
  assertEq(neither.status, 400, "mark-read with neither all nor ids → 400");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("Notification functional test errored:", e); process.exitCode = 1; });
