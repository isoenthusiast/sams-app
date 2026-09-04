import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { buildExportPackage } from "@/lib/data-trust-export";

/**
 * SAMS-011 public API — DB-level verification (run after the functional HTTP test
 * against the same throwaway DB, which has created ≥2 ApiKey rows):
 *
 *   (f) KEY MATERIAL RULE — the plaintext is never stored:
 *         - every ApiKey.keyHash is a bcrypt hash ($2a/$2b/$2y);
 *         - NO ApiKey column contains a `sams_pub_` plaintext substring;
 *         - NO ActivityLog row (beforeData/afterData/description) contains a
 *           `sams_pub_` plaintext substring (we never log key material);
 *         - a bcrypt round-trip proves a generated plaintext hashes to a $2 hash
 *           and compares equal (the mechanism behind "hash-only storage").
 *   (e) EXPORT — building the client-data export for company A yields ZERO
 *         ApiKey entries (the table is deliberately not in EXPORT_TABLES).
 */
let failures = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const fail = (m: string) => { failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (c: boolean, m: string) => (c ? ok(m) : fail(m));
const assertEq = (a: number, b: number, m: string) => (a === b ? ok(`${m} (= ${b})`) : fail(`${m}: expected ${b}, got ${a}`));

const A = "cmp_pa_a";

async function main() {
  console.log("=== SAMS-011 public API DB verification ===");

  console.log("\n[1] (f) hash-only storage");
  const rows = await prisma.apiKey.findMany({ select: { id: true, keyHash: true, label: true, companyId: true } });
  assertTrue(rows.length >= 2, `≥2 ApiKey rows exist (created by functional test) — got ${rows.length}`);
  assertTrue(rows.every((r) => /^\$2[aby]\$/.test(r.keyHash)), "every ApiKey.keyHash is a bcrypt hash");

  const likeScan = await prisma.$queryRawUnsafe(
    'SELECT count(*)::int AS n FROM "ApiKey" WHERE "keyHash" LIKE \'%sams_pub_%\' OR "label" LIKE \'%sams_pub_%\' OR "id" LIKE \'%sams_pub_%\''
  ) as Array<{ n: number }>;
  assertEq(likeScan[0].n, 0, "no ApiKey column stores a sams_pub_ plaintext");

  const logScan = await prisma.$queryRawUnsafe(
    'SELECT count(*)::int AS n FROM "ActivityLog" WHERE "beforeData"::text LIKE \'%sams_pub_%\' OR "afterData"::text LIKE \'%sams_pub_%\' OR "description" LIKE \'%sams_pub_%\''
  ) as Array<{ n: number }>;
  assertEq(logScan[0].n, 0, "no ActivityLog row contains a sams_pub_ plaintext");

  console.log("\n[2] (f) bcrypt round-trip (hash-only mechanism)");
  const { randomBytes } = await import("node:crypto");
  const plaintext = `sams_pub_${randomBytes(36).toString("base64url")}`;
  const hash = bcrypt.hashSync(plaintext, 12);
  assertTrue(/^\$2[aby]\$/.test(hash) && hash !== plaintext, "plaintext hashes to a bcrypt hash (not equal to plaintext)");
  assertTrue(bcrypt.compareSync(plaintext, hash), "correct plaintext verifies against the hash");
  assertTrue(!bcrypt.compareSync("sams_pub_wrong-key", hash), "a wrong plaintext does NOT verify");
  assertTrue(!hash.includes(plaintext), "the hash string does not embed the plaintext");

  console.log("\n[3] (e) client-data export contains no ApiKey rows");
  const pkg = await buildExportPackage(A);
  const entryHit = pkg.entries.filter((e) => /apikey/i.test(e.file) || /apikey/i.test(e.content.slice(0, 80)));
  assertEq(entryHit.length, 0, "export package entries contain no ApiKey file");
  const manifestHit = pkg.manifest.tables.filter((t) => /apikey/i.test(t.model) || /apikey/i.test(t.file));
  assertEq(manifestHit.length, 0, "export manifest tables contain no ApiKey entry");
  assertTrue(pkg.manifest.exclusionList.includes("apiKey"), "export exclusionList includes 'apiKey' (column-level belt-and-braces)");

  console.log("\n=== RESULT: " + (failures === 0 ? "PASS" : `${failures} FAILURES`) + " ===");
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("SAMS-011 verify_step errored:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
