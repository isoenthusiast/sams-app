import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { getSelectedCompanyId } from "@/lib/authz";

/** ActivityLog.activityType for provider company-context switches (SAMS-002). */
export const PROVIDER_CONTEXT_SWITCH = "PROVIDER_CONTEXT_SWITCH";

export type CompanyPortfolio = {
  companyId: string;
  companyCode: string;
  companyName: string;
  soc: {
    fullyComply: number;
    partiallyComply: number;
    notComply: number;
    notAssessed: number;
    total: number;
    coveragePct: number | null; // null when assessed === 0 (no assessed data → "Not assessed")
  };
  openFindings: number;
  openActions: number;
  overdueActions: number;
  inProgressAssessments: number;
  userCount: number;
  kbCount: number;
  lastActivity: string | null; // ISO timestamp, null when no activity
};

/**
 * Compute a company's portfolio metrics. READ-ONLY, and every query carries the
 * companyId filter (nested relation traversal where the model lacks a direct
 * `companyId` — Findings/Actions go via Assessment, per the repoused convention).
 * This is what keeps the tenant-isolation invariant intact.
 */
async function companyMetrics(companyId: string): Promise<CompanyPortfolio | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, companyID: true, companyName: true },
  });
  if (!company) return null;

  // ── SOC coverage (Requirement.socStatus, companyId-scoped) ──
  const [socTotal, fully, partially, notComply] = await Promise.all([
    prisma.requirement.count({ where: { companyId } }),
    prisma.requirement.count({ where: { companyId, socStatus: "FullyComply" } }),
    prisma.requirement.count({ where: { companyId, socStatus: "PartiallyComply" } }),
    prisma.requirement.count({ where: { companyId, socStatus: "NotComply" } }),
  ]);
  const notAssessed = Math.max(0, socTotal - fully - partially - notComply);
  // Principle-#51 compliance-coverage semantics: % of ASSESSED requirements that
  // Fully Comply = fully / assessed, where assessed = total − notAssessed. Null
  // when nothing is assessed. A weighted average is deliberately NOT used — it
  // hides that zero requirements fully comply (matches the /fla Process Health
  // metric, which replaced the averaged metric class #51 itself).
  const assessed = fully + partially + notComply;
  const coveragePct = assessed === 0 ? null : Math.round((fully / assessed) * 100);

  // ── Findings & Actions (no direct companyId → traverse Assessment) ──
  const openFindings = await prisma.finding.count({ where: { assessment: { companyId } } });
  const openActions = await prisma.action.count({
    where: { finding: { assessment: { companyId } }, closureDate: null },
  });
  const overdueActions = await prisma.action.count({
    where: {
      finding: { assessment: { companyId } },
      closureDate: null,
      targetDate: { lt: new Date() },
    },
  });

  // ── In-progress assessments ──
  const inProgressAssessments = await prisma.assessment.count({
    where: { companyId, status: "InProgress" },
  });

  // ── User count (distinct users mapped to the company via User.companyId OR UserCompany) ──
  const userCountRow = await prisma.$queryRawUnsafe<Array<{ userCount: number }>>(
    `SELECT COUNT(DISTINCT id)::int AS "userCount" FROM (
       SELECT u.id FROM "User" u WHERE u."companyId" = $1
       UNION
       SELECT uc."userId" FROM "UserCompany" uc WHERE uc."companyId" = $1
     ) users`,
    companyId
  );
  const userCount = userCountRow[0]?.userCount ?? 0;

  // ── KB entry count ──
  const kbCount = await prisma.knowledgebase.count({ where: { companyId } });

  // ── Last activity: max timestamp across the company's data (no ActivityLog.companyId) ──
  const lastActivity = await lastActivityFor(companyId);

  return {
    companyId: company.id,
    companyCode: company.companyID,
    companyName: company.companyName,
    soc: {
      fullyComply: fully,
      partiallyComply: partially,
      notComply: notComply,
      notAssessed,
      total: socTotal,
      coveragePct,
    },
    openFindings,
    openActions,
    overdueActions,
    inProgressAssessments,
    userCount,
    kbCount,
    lastActivity,
  };
}

async function lastActivityFor(companyId: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ lastActivity: Date | null }>>(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(a."startDate") FROM "Assessment" a WHERE a."companyId" = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(a."endDate") FROM "Assessment" a WHERE a."companyId" = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(r."createdAt") FROM "Requirement" r WHERE r."companyId" = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(f."createdAt") FROM "Finding" f JOIN "Assessment" a ON a.id = f."assessmentId" WHERE a."companyId" = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(ac."createdDate") FROM "Action" ac JOIN "Finding" f ON f.id = ac."findingId" JOIN "Assessment" a ON a.id = f."assessmentId" WHERE a."companyId" = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(kb."createdDate") FROM "Knowledgebase" kb WHERE kb."companyId" = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(u."lastActivityDate") FROM "User" u WHERE u."companyId" = $1), 'epoch'::timestamptz)
     ) AS "lastActivity"`,
    companyId
  );
  const d = rows[0]?.lastActivity;
  if (!d) return null;
  // `epoch` sentinel (1970-01-01) means no data for the company → null.
  return d.getTime() <= 0 ? null : d.toISOString();
}

/** Deterministic worst-coverage-first ordering (ascending coveragePct; no-data last). */
function compareCompanies(a: CompanyPortfolio, b: CompanyPortfolio): number {
  const rank = (p: CompanyPortfolio) =>
    p.soc.total === 0 ? Number.MAX_SAFE_INTEGER : (p.soc.coveragePct ?? 0);
  const byCoverage = rank(a) - rank(b);
  if (byCoverage !== 0) return byCoverage;
  return a.companyCode.localeCompare(b.companyCode);
}

/** Full read-only portfolio across every company (provider-gated by callers). */
export async function getPortfolio(): Promise<CompanyPortfolio[]> {
  const companies = await prisma.company.findMany({
    orderBy: { companyID: "asc" },
    select: { id: true },
  });
  const rows = await Promise.all(companies.map((c) => companyMetrics(c.id)));
  return rows.filter((r): r is CompanyPortfolio => r !== null).sort(compareCompanies);
}

/**
 * Audit a provider company-context switch. Reads the CURRENT selected company
 * from the cookie; if it differs from the target, writes a PROVIDER_CONTEXT_SWITCH
 * ActivityLog row (before = old, after = new). Returns the redirect target for
 * the existing /admin or /fla views.
 */
export async function switchCompanyContext(params: {
  userId: string;
  username?: string;
  role?: string;
  targetCompanyId: string;
}) {
  const { userId, username, role, targetCompanyId } = params;
  const currentCompanyId = await getSelectedCompanyId();
  const target = await prisma.company.findUnique({
    where: { id: targetCompanyId },
    select: { id: true, companyID: true, companyName: true },
  });
  if (!target) {
    return { ok: false, error: "Company not found", redirectTo: null, switched: false };
  }
  const before = currentCompanyId ?? null;
  const after = target.id;
  const switched = before !== after;

  if (switched) {
    await logActivity({
      activityType: PROVIDER_CONTEXT_SWITCH,
      description: `${username || userId} switched provider context to ${target.companyName} (${target.companyID})`,
      username: username || userId,
      refTable: "Company",
      refRecord: after,
      beforeData: before ? { companyId: before } : null,
      afterData: { companyId: after },
    });
  }

  const redirectTo = role === "Admin" ? "/admin" : "/fla";
  return { ok: true, error: null, redirectTo, switched };
}
