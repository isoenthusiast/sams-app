import { prisma } from "@/lib/prisma";

/**
 * In-App Notifications (SAMS-006) — emission-failure fault injection (owner test
 * plan (c) / DoD negative path). Proves that an emission failure can NEVER fail
 * the parent fabric write, in BOTH failure positions:
 *
 *   A. The Notification WRITE is broken (table renamed → `prisma.notification.create`
 *      throws) — the request `send` transition must still succeed (200, Requested)
 *      and NO notification row is left behind.
 *   B. A PRE-EMISSION query is broken (the `User` table renamed → `userName()`'s
 *      `prisma.user.findUnique` throws) — the PATCH handler awaits the emitters, so
 *      if this were unguarded the request would 500 AFTER the transition committed.
 *      It must instead still succeed (200, Requested), and the notification row IS
 *      written using the graceful "Someone" name fallback.
 *
 * Both guards live in the emission path: `userName()` catches → "Someone", and the
 * PATCH route wraps the three `emit*` calls in a try/catch (settled decision #4).
 *
 * Setup: a built server at BASE_URL pointed at the throwaway DB (seeded), and
 * DATABASE_URL set to the same throwaway DB. The table renames happen here.
 */
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
  if (!csrf) return { ok: false, jar };
  const body = new URLSearchParams({ csrfToken: csrf, username, password, json: "true" });
  await fetchWithManual(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }, jar);
  const session = await fetchWithManual(`${BASE}/api/auth/session`, { method: "GET" }, jar);
  const sess = await session.json().catch(() => ({}));
  return { ok: !!(sess?.user), jar };
}

/** Create a fresh Draft evidence request between provider → client. */
async function createDraft(providerJar) {
  const create = await fetchWithManual(`${BASE}/api/evidence-requests`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Fault injection", instructions: "ignore", requestedFromUserId: "usr_ntf_client", assessmentId: "ass_ntf_a" }),
  }, providerJar);
  const createJson = await create.json();
  assertEq(create.status, 201, "created draft request");
  assertTrue(!!createJson.evidenceRequest?.id, "erId present");
  return createJson.evidenceRequest?.id;
}

/** Drive a `send` transition; returns {status, json}. */
async function send(providerJar, erId) {
  const send = await fetchWithManual(`${BASE}/api/evidence-requests/${erId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }),
  }, providerJar);
  const sendJson = await send.json().catch(() => ({}));
  return { status: send.status, json: sendJson };
}

async function main() {
  console.log(`\n=== Emission-failure fault injection against ${BASE} ===`);
  const provider = await login("ntf_provider", "Test1234!");
  assertTrue(provider.ok, "provider logged in");

  // ── Scenario A: the Notification WRITE is broken (existing proof) ──────────
  console.log("\n[A] Break the Notification write (prisma.notification.create throws)");
  const erA = await createDraft(provider.jar);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Notification" RENAME TO "Notification_fault_broken"`);
  console.log("  · Notification table renamed (emission create will fail)…");
  let a;
  try {
    a = await send(provider.jar, erA);
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Notification_fault_broken" RENAME TO "Notification"`);
    console.log("  · Notification table restored.");
  }
  assertEq(a.status, 200, `[A] parent write succeeds despite emission failure (status ${a.status})`);
  assertEq(a.json.evidenceRequest?.status, "Requested", "[A] request reached Requested (parent transition applied)");
  const countA = await prisma.notification.count({ where: { entityId: erA } });
  assertEq(countA, 0, "[A] no notification row created for the faulted request");

  // ── Scenario B: a PRE-EMISSION query is broken (the gap Conan flagged) ─────
  // userName() runs `prisma.user.findUnique`; if it throws unguarded, the PATCH
  // handler awaits the emitter and 500s AFTER the transition committed. It must
  // be contained: 200 + Requested, and the row still written with "Someone".
  console.log("\n[B] Break a pre-emission query (prisma.user.findUnique inside userName throws)");
  const erB = await createDraft(provider.jar);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" RENAME TO "User_fault_broken"`);
  console.log("  · User table renamed (userName pre-query will fail)…");
  let b;
  try {
    b = await send(provider.jar, erB);
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User_fault_broken" RENAME TO "User"`);
    console.log("  · User table restored.");
  }
  assertEq(b.status, 200, `[B] parent write succeeds despite pre-emission query failure (status ${b.status})`);
  assertEq(b.json.evidenceRequest?.status, "Requested", "[B] request reached Requested (parent transition applied)");
  const rowB = await prisma.notification.findFirst({
    where: { entityId: erB },
    orderBy: { createdAt: "desc" },
  });
  assertTrue(!!rowB, "[B] notification row WAS written (emission completed)");
  assertTrue(!!rowB?.body && rowB.body.includes("Someone"), `[B] body uses the graceful "Someone" fallback (got "${rowB?.body}")`);

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Fault-injection verify errored:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
