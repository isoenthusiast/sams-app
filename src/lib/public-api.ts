import { prisma } from "@/lib/prisma";

type PublicCompany = { id: string; companyID: string; companyName: string };

/**
 * Public read-only API queries (SAMS-011, Phase 3b Feature B).
 *
 * Every query takes a `companyId` resolved SOLELY from the bearer key's owning
 * company (see src/lib/api-keys.ts `authenticatePublicKey`). SCOPE-BY-CONSTRUCTION:
 * there is no company parameter, no override, no fallback — the caller cannot
 * reach a company other than the key's. Findings/Actions traverse
 * Assessment → companyId (no direct column), exactly as the portal does.
 *
 * This file deliberately mirrors the CLIENT-VISIBLE semantics of the portal
 * helpers (src/lib/portal.ts) but is separate so the public surface is explicit,
 * read-only, and free of the user-specific portal fields (e.g. per-user evidence
 * requests) that a key holder has no business seeing.
 */

/* ── SOC (Statement of Compliance) ───────────────────────────────────────── */

export type SocOverall = {
  fullyComply: number;
  partiallyComply: number;
  notComply: number;
  notAssessed: number;
  total: number;
  coveragePct: number | null; // #51 semantic: % FullyComply of ASSESSED (null when assessed===0)
};

export type SocPerProcessArea = {
  processAreaId: string;
  name: string;
  fully: number;
  assessed: number;
  pct: number | null;
  standard: string;
};

export type PublicSoc = {
  company: PublicCompany;
  generatedAt: string;
  soc: SocOverall;
  perProcessArea: SocPerProcessArea[];
};

export async function getPublicSoc(companyId: string, company: PublicCompany): Promise<PublicSoc> {
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

  const perProcessArea: SocPerProcessArea[] = processAreas.map((pa) => {
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

  return {
    company,
    generatedAt: new Date().toISOString(),
    soc: { fullyComply: fully, partiallyComply: partially, notComply: notComply, notAssessed, total: socTotal, coveragePct },
    perProcessArea,
  };
}

/* ── Findings ──────────────────────────────────────────────────────────────── */

/**
 * A finding's derived status (there is NO `status` column — see the finding model
 * in prisma/schema.prisma). This is the domain-meaningful reading a client's
 * dashboard wants: a finding is OPEN while it has at least one unresolved action
 * (closureDate null); CLOSED otherwise (all actions closed, or none recorded).
 */
export type PublicFindingStatus = "open" | "closed";

export type PublicFinding = {
  id: string;
  description: string;
  severity: string;
  repeat: boolean;
  requirementRId: number | null;
  processAreaId: string | null;
  riskID: string | null;
  riskDescription: string | null;
  rootCause: string | null;
  recommendation: string | null;
  managementResponse: string | null;
  status: PublicFindingStatus;
  openActions: number;
  createdAt: string;
  assessment: { id: string; name: string; status: string | null } | null;
};

export type PublicFindings = {
  company: PublicCompany;
  generatedAt: string;
  count: number;
  statusFilter: string | null;
  findings: PublicFinding[];
};

export async function getPublicFindings(
  companyId: string,
  company: PublicCompany,
  statusFilter?: string | null
): Promise<PublicFindings> {
  const status = (statusFilter ?? "").toLowerCase().trim();
  let where: Record<string, unknown> = { assessment: { companyId } };
  if (status === "open") {
    where = { ...where, actions: { some: { closureDate: null } } };
  } else if (status === "closed") {
    where = { ...where, actions: { none: { closureDate: null } } };
  } else if (status && status !== "all") {
    // Unknown status → empty result (never a fallthrough to all rows; a caller
    // asking for a status we don't define gets a clean empty list, documented).
    where = { ...where, id: "__undefined_status__" };
  }

  const rows = await prisma.finding.findMany({
    where: where as never,
    include: {
      assessment: { select: { id: true, name: true, status: true } },
      actions: { select: { id: true, closureDate: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const findings: PublicFinding[] = rows.map((r) => {
    const openActions = r.actions.filter((a) => a.closureDate == null).length;
    return {
      id: r.id,
      description: r.description,
      severity: r.severity,
      repeat: r.repeat,
      requirementRId: r.requirementRId,
      processAreaId: r.processAreaId,
      riskID: r.riskID,
      riskDescription: r.riskDescription,
      rootCause: r.rootCause,
      recommendation: r.recommendation,
      managementResponse: r.managementResponse,
      status: openActions > 0 ? "open" : "closed",
      openActions,
      createdAt: r.createdAt.toISOString(),
      assessment: r.assessment
        ? { id: r.assessment.id, name: r.assessment.name, status: (r.assessment as { status?: string | null }).status ?? null }
        : null,
    };
  });

  return {
    company,
    generatedAt: new Date().toISOString(),
    count: findings.length,
    statusFilter: status || null,
    findings,
  };
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

export type PublicAction = {
  id: string;
  actionId: string | null;
  actionDescription: string;
  actionDetails: string | null;
  actionParty: string | null;
  auditee: string | null;
  targetDate: string | null;
  originalTargetDate: string | null;
  numberOfExtensions: number;
  actionClosureEffective: boolean;
  closureDate: string | null;
  overdue: boolean;
  open: boolean;
  findingId: string;
  findingDescription: string | null;
  findingSeverity: string;
};

export type PublicActions = {
  company: PublicCompany;
  generatedAt: string;
  count: number;
  overdueFilter: boolean | null;
  actions: PublicAction[];
};

export async function getPublicActions(
  companyId: string,
  company: PublicCompany,
  overdueFilter?: boolean | null
): Promise<PublicActions> {
  const now = new Date();
  const overdue = overdueFilter === true;
  // Filter at the query layer to keep the payload trim, but re-derive `overdue`
  // in JS (below) so the response value is authoritative and consistent.
  const where: Record<string, unknown> = {
    finding: { assessment: { companyId } },
    ...(overdue ? { closureDate: null, targetDate: { lt: now } } : {}),
  };

  const rows = await prisma.action.findMany({
    where: where as never,
    include: {
      finding: { select: { id: true, description: true, severity: true } },
    },
    orderBy: [{ targetDate: "asc" }, { createdDate: "desc" }],
  });

  const actions: PublicAction[] = rows.map((a) => {
    const open = a.closureDate == null;
    const isOverdue = open && a.targetDate != null && a.targetDate < now;
    return {
      id: a.id,
      actionId: a.actionId,
      actionDescription: a.actionDescription,
      actionDetails: a.actionDetails,
      actionParty: a.actionParty,
      auditee: a.auditee,
      targetDate: a.targetDate ? a.targetDate.toISOString() : null,
      originalTargetDate: a.originalTargetDate ? a.originalTargetDate.toISOString() : null,
      numberOfExtensions: a.numberOfExtensions,
      actionClosureEffective: a.actionClosureEffective,
      closureDate: a.closureDate ? a.closureDate.toISOString() : null,
      overdue: isOverdue,
      open,
      findingId: a.findingId,
      findingDescription: a.finding.description ?? null,
      findingSeverity: a.finding.severity,
    };
  });

  return {
    company,
    generatedAt: new Date().toISOString(),
    count: actions.length,
    overdueFilter: overdue || null,
    actions,
  };
}
