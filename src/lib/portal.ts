import { prisma } from "@/lib/prisma";
import { clientVisibleWhere } from "@/lib/conversation";

export type PortalCompany = { id: string; companyID: string; companyName: string };

/**
 * Client Portal (SAMS-005) — scoped read/query helpers.
 *
 * SCOPE-BY-CONSTRUCTION (settled decision #1): every query here takes a
 * `companyId` resolved from the SESSION user's own company (or one of their
 * UserCompany mappings) and pins every filter to it. A caller must NEVER pass a
 * company the session user doesn't belong to; the page/route layers validate
 * that through `resolvePortalCompanyId`. Findings/Actions traverse Assessment →
 * companyId (no direct column), Comments/EvidenceRequests/+SOC audits carry
 * companyId directly.
 *
 * CONTENT RULE (settled decision #2): only SharedWithClient + client-authored
 * content ever reaches a portal query. Provider-Internal comments are excluded
 * at the query level via `clientVisibleWhere()` — never by a UI filter.
 *
 * READ-MOSTLY (settled decision #5): the ONLY portal write is the management
 * response (+ evidence submission via the fabric), handled in the route layer.
 */

/** A client-visible comment predicate (authorPlane=Client OR visibility=SharedWithClient). */
export function portalCommentWhere(extra: Record<string, unknown> = {}) {
  return { ...extra, OR: clientVisibleWhere().OR };
}

/**
 * Resolve the portal's active company for a session user.
 *
 * - providerRole users do NOT land on the portal (they get /operator); this
 *   returns null for them so a caller can redirect. A provider who is ALSO a
 *   mapped client user may still open their company's portal, but the landing
 *   rule keeps the default on /operator.
 * - A user's portal companies = {User.companyId} ∪ {UserCompany.companyId}
 *   (archive rows excluded). If the user has exactly one → that one. If they
 *   have none → null (the guided empty state).
 * - For 2+ companies, the active company resolves in this order (matching the
 *   main app's URL-param-primary / cookie-fallback convention):
 *     1. `selectedCompanyId` (?companyId=) — primary — when it is in the set.
 *     2. the `selectedCompanyId` cookie — fallback — when it is in the set
 *        (read server-side by the caller and passed as `cookieCompanyId`).
 *     3. `User.companyId` (home company) — when it is in the set.
 *     4. first company by `companyID` (ascending) — deterministic last resort.
 *   A cross-tenant `?companyId=` that is NOT in the user's set is ignored and
 *   falls through to the default — it never leaks.
 */
export async function resolvePortalCompanyId(opts: {
  userId: string;
  providerRole?: string | null;
  selectedCompanyId?: string | null;
  cookieCompanyId?: string | null;
}): Promise<{ companyId: string | null; companies: { id: string; companyID: string; companyName: string }[] }> {
  const { userId, providerRole } = opts;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, userCompanies: { include: { company: true } } },
  });
  if (!user) return { companyId: null, companies: [] };

  const map = new Map<string, { id: string; companyID: string; companyName: string }>();
  if (user.companyId) {
    const c = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { id: true, companyID: true, companyName: true },
    });
    if (c) map.set(c.id, c);
  }
  for (const uc of user.userCompanies) {
    if (uc.company && uc.company.archivedAt == null) {
      map.set(uc.company.id, { id: uc.company.id, companyID: uc.company.companyID, companyName: uc.company.companyName });
    }
  }
  const companies = Array.from(map.values());

  // Empty state ONLY when the user genuinely has zero companies.
  if (companies.length === 0) return { companyId: null, companies: [] };
  // Single-company regression: that one, regardless of any param/cookie.
  if (companies.length === 1) return { companyId: companies[0].id, companies };

  // 1. URL param (?companyId=) — primary; must be a mapped company.
  if (opts.selectedCompanyId && map.has(opts.selectedCompanyId)) {
    return { companyId: opts.selectedCompanyId, companies };
  }
  // 2. selectedCompanyId cookie — fallback; must be a mapped company.
  if (opts.cookieCompanyId && map.has(opts.cookieCompanyId)) {
    return { companyId: opts.cookieCompanyId, companies };
  }
  // 3. Home company (User.companyId) — if present in the set.
  if (user.companyId && map.has(user.companyId)) {
    return { companyId: user.companyId, companies };
  }
  // 4. First company by companyID (ascending) — deterministic last resort.
  const first = [...companies].sort((a, b) => a.companyID.localeCompare(b.companyID))[0];
  return { companyId: first.id, companies };
}

/**
 * Portal WRITE gate (SAMS-005, settled decisions #3/#5): does `userId` have
 * portal MEMBERSHIP of `companyId`? Mirrors `resolvePortalCompanyId`'s read-side
 * rule exactly — a user belongs to a company if `User.companyId === companyId`
 * OR a `UserCompany` mapping exists. There is deliberately NO global Admin
 * bypass here: decision #3 says the response is editable by client Assessor+
 * roles "OF THAT COMPANY", so a provider-plane/Admin user who is not a member
 * of the target company gets 403. If an operator must assist, that is an
 * explicit provider-plane decision elsewhere — not an accidental inheritance
 * on the portal's ONLY write path.
 *
 * Single query (no N+1): reads `companyId` + the user's `UserCompany` mappings
 * in one `findUnique`.
 */
export async function portalHasCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, userCompanies: { select: { companyId: true } } },
  });
  if (!user) return false;
  if (user.companyId === companyId) return true;
  return user.userCompanies.some((uc) => uc.companyId === companyId);
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export type PortalDashboard = {
  soc: {
    fullyComply: number;
    partiallyComply: number;
    notComply: number;
    notAssessed: number;
    total: number;
    coveragePct: number | null; // #51 semantic: % FullyComply of ASSESSED (null when assessed===0)
  };
  perProcessArea: Array<{ processAreaId: string; name: string; fully: number; assessed: number; pct: number | null; standard: string }>;
  openFindings: number;
  openActions: number;
  overdueActions: number;
  myOpenEvidenceRequests: number;
};

export async function getPortalDashboard(companyId: string, userId: string): Promise<PortalDashboard> {
  const [socTotal, fully, partially, notComply, processAreas] = await Promise.all([
    prisma.requirement.count({ where: { companyId } }),
    prisma.requirement.count({ where: { companyId, socStatus: "FullyComply" } }),
    prisma.requirement.count({ where: { companyId, socStatus: "PartiallyComply" } }),
    prisma.requirement.count({ where: { companyId, socStatus: "NotComply" } }),
    prisma.processArea.findMany({
      where: { companyId },
      include: {
        standardRef: true,
        requirements: { where: { applicable: true }, select: { socStatus: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const notAssessed = Math.max(0, socTotal - fully - partially - notComply);
  const assessed = fully + partially + notComply;
  const coveragePct = assessed === 0 ? null : Math.round((fully / assessed) * 100);

  const perProcessArea = processAreas.map((pa) => {
    const reqs = pa.requirements ?? [];
    const f = reqs.filter((r) => r.socStatus === "FullyComply").length;
    const a = reqs.filter((r) => r.socStatus !== null).length;
    return {
      processAreaId: pa.id,
      name: pa.name,
      fully: f,
      assessed: a,
      pct: a > 0 ? Math.round((f / a) * 100) : null,
      standard: pa.standardRef?.standard ?? pa.standard ?? "Other",
    };
  });

  const [openFindings, openActions, overdueActions, myOpenEvidenceRequests] = await Promise.all([
    prisma.finding.count({ where: { assessment: { companyId } } }),
    prisma.action.count({ where: { finding: { assessment: { companyId } }, closureDate: null } }),
    prisma.action.count({
      where: { finding: { assessment: { companyId } }, closureDate: null, targetDate: { lt: new Date() } },
    }),
    prisma.evidenceRequest.count({
      where: { companyId, requestedFromUserId: userId, status: { in: ["Requested", "Submitted", "Rejected"] } },
    }),
  ]);

  return {
    soc: { fullyComply: fully, partiallyComply: partially, notComply: notComply, notAssessed, total: socTotal, coveragePct },
    perProcessArea,
    openFindings,
    openActions,
    overdueActions,
    myOpenEvidenceRequests,
  };
}

/* ── Findings ───────────────────────────────────────────────────────────── */

export async function getPortalFindings(companyId: string) {
  return prisma.finding.findMany({
    where: { assessment: { companyId } },
    include: {
      assessment: { select: { id: true, name: true, status: true } },
      managementResponseBy: { select: { id: true, name: true, username: true } },
      actions: { select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

/* ── Actions ────────────────────────────────────────────────────────────── */

export async function getPortalActions(companyId: string) {
  const rows = await prisma.action.findMany({
    where: { finding: { assessment: { companyId } } },
    include: {
      finding: { select: { id: true, description: true, severity: true } },
    },
    orderBy: [{ targetDate: "asc" }, { createdDate: "desc" }],
  });
  const now = new Date();
  return rows.map((a) => ({ ...a, overdue: a.closureDate == null && a.targetDate != null && a.targetDate < now }));
}

/* ── Requests (current user's, deep-link to fabric) ─────────────────────── */

export async function getPortalRequests(userId: string, companyId: string) {
  return prisma.evidenceRequest.findMany({
    where: { requestedFromUserId: userId, companyId },
    include: {
      requestedBy: { select: { id: true, name: true, username: true } },
      assessment: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/* ── Activity feed (composed, NEWEST first, 50/page) ────────────────────── */

const ACTIVITY_PAGE_SIZE = 50;

export type PortalActivityItem = {
  id: string;
  ts: Date;
  kind: "evidence_request" | "comment" | "finding" | "soc";
  title: string;
  detail: string;
  entityType: string; // "Finding" | "EvidenceRequest" | "Requirement" | "ProcessArea"
  entityId: string;
  href: string | null;
};

export async function getPortalActivity(companyId: string, opts: { page: number }): Promise<{ items: PortalActivityItem[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, opts.page);
  const skip = (page - 1) * ACTIVITY_PAGE_SIZE;

  const [evidenceRequests, comments, findings, socAudits] = await Promise.all([
    prisma.evidenceRequest.findMany({
      where: { companyId },
      select: { id: true, title: true, createdAt: true, submittedAt: true, status: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.findMany({
      where: portalCommentWhere({ companyId }) as any,
      select: { id: true, entityType: true, entityId: true, body: true, createdAt: true }, // portalCommentWhere adds OR
      orderBy: { createdAt: "desc" },
    }),
    prisma.finding.findMany({
      where: { assessment: { companyId } },
      select: { id: true, description: true, severity: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.socStatementAudit.findMany({
      where: { companyId },
      select: { id: true, requirementRId: true, verdict: true, socAt: true },
      orderBy: { socAt: "desc" },
    }),
  ]);

  const items: PortalActivityItem[] = [];

  for (const er of evidenceRequests) {
    items.push({
      id: `er-${er.id}`,
      ts: er.createdAt,
      kind: "evidence_request",
      title: `Evidence request: ${er.title}`,
      detail: er.status,
      entityType: "EvidenceRequest",
      entityId: er.id,
      href: `/portal/requests`,
    });
    if (er.submittedAt) {
      items.push({
        id: `er-sub-${er.id}`,
        ts: er.submittedAt,
        kind: "evidence_request",
        title: `Evidence submitted: ${er.title}`,
        detail: "Submission received",
        entityType: "EvidenceRequest",
        entityId: er.id,
        href: `/portal/requests`,
      });
    }
  }

  for (const c of comments) {
    items.push({
      id: `cm-${c.id}`,
      ts: c.createdAt,
      kind: "comment",
      title: c.entityType === "Finding" ? "Comment shared on a finding" : "Comment shared on an evidence request",
      detail: c.body,
      entityType: c.entityType ?? "Finding",
      entityId: c.entityId,
      href: c.entityType === "Finding" ? `/portal/findings` : `/portal/requests`,
    });
  }

  for (const f of findings) {
    items.push({
      id: `fd-${f.id}`,
      ts: f.createdAt,
      kind: "finding",
      title: `Finding raised (${f.severity})`,
      detail: f.description,
      entityType: "Finding",
      entityId: f.id,
      href: `/portal/findings`,
    });
  }

  for (const s of socAudits) {
    items.push({
      id: `soc-${s.id}`,
      ts: s.socAt,
      kind: "soc",
      title: `Statement of Compliance updated (${s.verdict})`,
      detail: `Requirement #${s.requirementRId}`,
      entityType: "Requirement",
      entityId: String(s.requirementRId),
      href: null,
    });
  }

  items.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  const hasMore = items.length > skip + ACTIVITY_PAGE_SIZE;
  return { items: items.slice(skip, skip + ACTIVITY_PAGE_SIZE), hasMore, page };
}
