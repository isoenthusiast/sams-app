// Regression: existing polymorphic attachment route for a NON-EvidenceRequest
// destTable must remain unchanged. Log in as provider (Assessor) and upload to
// destTable=Finding. Expects HTTP 201.
const BASE = "http://localhost:3200";
class Jar {
  constructor() { this.map = new Map(); }
  set(setCookie) {
    if (!setCookie) return;
    const s = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of s) { const pair = c.split(";")[0].split("="); if (pair.length >= 2) this.map.set(pair[0].trim(), decodeURIComponent(pair.slice(1).join("="))); }
  }
  header() { return [...this.map].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "); }
}
async function fetchManual(url, opts = {}, jar) {
  const headers = new Headers(opts.headers || {});
  if (jar) headers.set("cookie", jar.header());
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  if (jar && res.headers.getSetCookie) jar.set(res.headers.getSetCookie());
  return res;
}
async function main() {
  let failures = 0, checks = 0;
  const ok = (m) => { checks++; console.log("  ✓ " + m); };
  const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
  const jar = new Jar();
  const csrf = (await (await fetchManual(`${BASE}/api/auth/csrf`, {}, jar)).json())?.csrfToken;
  const body = new URLSearchParams({ csrfToken: csrf, username: "cf_provider", password: "Test1234!", json: "true" });
  await fetchManual(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }, jar);
  const sess = await (await fetchManual(`${BASE}/api/auth/session`, {}, jar)).json();
  ok(!!(sess?.user), "provider logged in for attachment regression");
  const fd = new FormData();
  fd.append("file", new Blob(["finding evidence bytes"]), "finding_evidence.txt");
  fd.append("destTable", "Finding");
  fd.append("recId", "FID-CF-A01");
  const up = await fetchManual(`${BASE}/api/attachments`, { method: "POST", body: fd }, jar);
  ok(up.status === 201, `attachment upload to destTable=Finding -> ${up.status}`);
  if (up.status !== 201) fail("expected 201 for Finding attachment");
  const list = await (await fetchManual(`${BASE}/api/attachments?destTable=Finding&recId=FID-CF-A01`, {}, jar)).json();
  ok(Array.isArray(list) && list.length >= 1, `GET /api/attachments?destTable=Finding returns the upload (${Array.isArray(list) ? list.length : "?"} rows)`);
  console.log(`\n=== ATTACHMENT REGRESSION RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; });
