import { prisma } from "@/lib/prisma";

/**
 * SAMS-008 test helper — small DB probes the HTTP functional test shells out to
 * (it can't query Postgres directly). Run: `tsx db_probe.mts <cmd> [...args]`.
 *
 * Commands:
 *   activitylog <password1> [password2...]  → print count of ActivityLog rows
 *                                            whose description/beforeData/afterData
 *                                            contain ANY given string (should be 0).
 *   user-exists <username>                  → "true"/"false" (a User row exists).
 *   company-by-code <companyID>             → company id or "null".
 *   scom-cost <companyId>                   → count of company-scoped content rows.
 */
const [cmd, ...rest] = process.argv.slice(2);

async function run() {
  if (cmd === "activitylog") {
    const needles = rest.map((s) => s.toLowerCase()).filter(Boolean);
    const rows = await prisma.activityLog.findMany({ select: { description: true, beforeData: true, afterData: true } });
    let hits = 0;
    for (const r of rows) {
      const blob = `${r.description ?? ""} ${JSON.stringify(r.beforeData ?? "")} ${JSON.stringify(r.afterData ?? "")}`.toLowerCase();
      if (needles.some((n) => blob.includes(n))) hits++;
    }
    console.log(String(hits));
  } else if (cmd === "user-exists") {
    const u = await prisma.user.findUnique({ where: { username: rest[0] }, select: { id: true } });
    console.log(u ? "true" : "false");
  } else if (cmd === "company-by-code") {
    const c = await prisma.company.findUnique({ where: { companyID: rest[0] }, select: { id: true } });
    console.log(c ? c.id : "null");
  } else if (cmd === "list-wiz") {
    // Throwaway onboarding-test companies (companyID prefix WIZF/WIZU/WIZTEST).
    const rows = await prisma.company.findMany({ where: { companyID: { startsWith: "WIZ" } }, select: { id: true, companyID: true } });
    console.log(JSON.stringify(rows));
  } else if (cmd === "user-password-is-hash") {
    // print whether the stored passwordHash for a username is a bcrypt hash (not plaintext)
    const u = await prisma.user.findUnique({ where: { username: rest[0] }, select: { passwordHash: true } });
    const v = u?.passwordHash ?? "";
    // bcrypt hashes start with $2a$ / $2b$ / $2y$ and length 60
    console.log(/^\$2[aby]\$/.test(v) && v.length === 60 ? "hash" : "plain-or-other");
  } else if (cmd === "set-deletion-scheduled") {
    // Arm a company's 30-day safety net so hard-delete will accept it.
    const c = await prisma.company.findUnique({ where: { id: rest[0] }, select: { id: true } });
    if (!c) console.log("not-found");
    else {
      const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await prisma.company.update({ where: { id: c.id }, data: { deletionScheduledAt: past, archivedAt: null } });
      console.log("armed");
    }
  } else {
    console.error("Unknown command");
    process.exitCode = 2;
  }
}

run()
  .catch((e) => {
    console.error("db_probe failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
