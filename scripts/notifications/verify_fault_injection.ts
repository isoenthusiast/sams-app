import { prisma } from "@/lib/prisma";

/**
 * In-App Notifications (SAMS-006) — emission-failure fault injection (owner test
 * plan (c) / DoD negative path). Proves that an emission failure can NEVER fail
 * the parent fabric write: while the Notification table is temporarily renamed
 * (so `prisma.notification.create` throws), the evidence-request `send`
 * transition must still succeed (HTTP 200, status Requested).
 *
 * Setup: a built server at BASE_URL pointed at the throwaway DB (seeded), and
 * DATABASE_URL set to the same throwaway DB. The DB rename happens here.
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

async function main() {
  console.log(`\n=== Emission-failure fault injection against ${BASE} ===`);
  const provider = await login("ntf_provider", "Test1234!");
  assertTrue(provider.ok, "provider logged in");

  // Create a fresh Draft request.
  const create = await fetchWithManual(`${BASE}/api/evidence-requests`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Fault injection", instructions: "ignore", requestedFromUserId: "usr_ntf_client", assessmentId: "ass_ntf_a" }),
  }, provider.jar);
  const createJson = await create.json();
  const erId = createJson.evidenceRequest?.id;
  assertEq(create.status, 201, "created draft request");
  assertTrue(!!erId, "erId present");

  // Break the Notification table so emission throws.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Notification" RENAME TO "Notification_fault_broken"`);
  console.log("  · Notification table renamed (emission will fail)…");

  try {
    const send = await fetchWithManual(`${BASE}/api/evidence-requests/${erId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }),
    }, provider.jar);
    const sendJson = await send.json();
    assertEq(send.status, 200, `parent write succeeds despite emission failure (status ${send.status})`);
    assertEq(sendJson.evidenceRequest?.status, "Requested", "request reached Requested (parent transition applied)");
  } finally {
    // Restore the table.
    await prisma.$executeRawUnsafe(`ALTER TABLE "Notification_fault_broken" RENAME TO "Notification"`);
    console.log("  · Notification table restored.");
  }

  // Cross-check: no notification row exists for this request (emission swallowed).
  const count = await prisma.notification.count({ where: { entityId: erId } });
  assertEq(count, 0, "no notification row created for the faulted request");

  console.log(`\n=== RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Fault-injection verify errored:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
