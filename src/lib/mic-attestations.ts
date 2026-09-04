import { prisma } from "@/lib/prisma";

/**
 * MIC Ritual (SAMS-014, Phase 4 Feature B) — attestation state + snapshot helpers.
 *
 * SETTLED DECISIONS (Edward-grilled, binding):
 *   1. Quarterly per process area, SOFT enforcement: overdue surfaces on the SOC
 *      dashboard + portal + weekly digest; NOTHING blocks, ever.
 *   2. `MicAttestation` pins WHAT was attested — the client's SOC posture at a
 *      point in time. `socSnapshot` is SERVER-COMPUTED at signing; a client-supplied
 *      snapshot is NEVER trusted.
 *   3. Cadence is configurable per company (quarterly default = 90 days); next due
 *      = last attestation (or company go-live) + cadence. due/soon/overdue are
 *      DERIVED (no stored flags, no scheduler).
 *   4. SPO notified when due via the existing notification rails (Phase-2c);
 *      the weekly digest carries an overdue-attestations line (Phase-3a).
 */

export const DEFAULT_ATTESTATION_CADENCE_DAYS = 90;
export const DUE_SOON_BAND_DAYS = 14;

export type AttestationState = "attested" | "dueSoon" | "overdue";

/** Effective cadence: a positive per-company override, else the quarterly default. */
export function resolveCadenceDays(attestationCadenceDays: number | null): number {
  return attestationCadenceDays && attestationCadenceDays > 0
    ? attestationCadenceDays
    : DEFAULT_ATTESTATION_CADENCE_DAYS;
}

/**
 * PURE state derivation (no DB, no scheduler). Deterministic and explainable:
 *   nextDue = (lastAttestation.attestedAt ?? Company.createdAt) + cadenceDays
 *   state   = nextDue < now ? overdue
 *             : nextDue <= now + DUE_SOON_BAND_DAYS ? dueSoon
 *             : attested
 */
export function deriveAttestationState(opts: {
  lastAttestedAt: Date | null;
  goLiveAt: Date;
  cadenceDays: number;
  now: Date;
}): { nextDue: Date; state: AttestationState } {
  const cadenceDays = resolveCadenceDays(opts.cadenceDays);
  const baseline = opts.lastAttestedAt ?? opts.goLiveAt;
  const nextDue = new Date(baseline.getTime() + cadenceDays * 24 * 60 * 60 * 1000);
  if (nextDue < opts.now) return { nextDue, state: "overdue" };
  const dueSoonBoundary = new Date(opts.now.getTime() + DUE_SOON_BAND_DAYS * 24 * 60 * 60 * 1000);
  if (nextDue <= dueSoonBoundary) return { nextDue, state: "dueSoon" };
  return { nextDue, state: "attested" };
}

/* ── Server-computed SOC snapshot (never client-supplied) ───────────────── */

export type PaSocSnapshot = {
  /** % of the PA's requirements FullyComply of ASSESSED (null when assessed===0). */
  coveragePct: number | null;
  /** Open findings for the PA (has ≥1 unresolved action). */
  findingCount: number;
  /** Overdue actions for the PA (open AND past targetDate). */
  overdueActionCount: number;
};

/**
 * Compute the SOC snapshot for a process area SERVER-SIDE at signing. Mirrors the
 * per-PA semantics of `getPortalDashboard` / `getPublicSoc`: coverage % of the
 * applicable requirements (FullyComply of assessed), open findings for the PA
 * (derived open = ≥1 closureDate-null action), overdue actions for the PA.
 */
export async function computePaSocSnapshot(paId: string, companyId: string): Promise<PaSocSnapshot> {
  const now = new Date();
  const [fully, partially, notComply, findingCount, overdueActionCount] = await Promise.all([
    prisma.requirement.count({ where: { processAreaId: paId, companyId, applicable: true, socStatus: "FullyComply" } }),
    prisma.requirement.count({ where: { processAreaId: paId, companyId, applicable: true, socStatus: "PartiallyComply" } }),
    prisma.requirement.count({ where: { processAreaId: paId, companyId, applicable: true, socStatus: "NotComply" } }),
    prisma.finding.count({ where: { processAreaId: paId, actions: { some: { closureDate: null } } } }),
    prisma.action.count({ where: { finding: { processAreaId: paId }, closureDate: null, targetDate: { lt: now } } }),
  ]);
  const assessed = fully + partially + notComply;
  const coveragePct = assessed === 0 ? null : Math.round((fully / assessed) * 100);
  return { coveragePct, findingCount, overdueActionCount };
}

/* ── Derived per-PA attestation state (surfaces/digests consume this) ────── */

export type PaAttestationStatus = {
  processAreaId: string;
  name: string;
  state: AttestationState;
  nextDue: string; // ISO
  lastAttestedAt: string | null; // ISO
  cadenceDays: number;
};

/**
 * ALL process areas of a company with their DERIVED attestation state. The single
 * source of truth for the dashboard chip, the portal status, and the digest line —
 * so the three surfaces can never disagree.
 */
export async function getCompanyAttestationStates(companyId: string): Promise<PaAttestationStatus[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, createdAt: true, attestationCadenceDays: true },
  });
  if (!company) return [];
  const cadenceDays = resolveCadenceDays(company.attestationCadenceDays);
  const now = new Date();
  const pas = await prisma.processArea.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      micAttestations: { orderBy: { attestedAt: "desc" }, take: 1, select: { attestedAt: true } },
    },
    orderBy: { name: "asc" },
  });
  return pas.map((pa) => {
    const lastAttestedAt = pa.micAttestations[0]?.attestedAt ?? null;
    const { nextDue, state } = deriveAttestationState({
      lastAttestedAt,
      goLiveAt: company.createdAt,
      cadenceDays,
      now,
    });
    return {
      processAreaId: pa.id,
      name: pa.name,
      state,
      nextDue: nextDue.toISOString(),
      lastAttestedAt: lastAttestedAt ? lastAttestedAt.toISOString() : null,
      cadenceDays,
    };
  });
}

export async function countOverdueAttestations(companyId: string): Promise<number> {
  return (await getCompanyAttestationStates(companyId)).filter((s) => s.state === "overdue").length;
}

/** Derive the ATTESTATION state for a single process area (dashboard chip / attest preview). */
export async function getPaAttestationStatus(paId: string, companyId: string | null): Promise<PaAttestationStatus | null> {
  if (!companyId) return null;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { createdAt: true, attestationCadenceDays: true },
  });
  if (!company) return null;
  const pa = await prisma.processArea.findUnique({
    where: { id: paId },
    select: { id: true, name: true },
  });
  if (!pa) return null;
  const last = await prisma.micAttestation.findFirst({
    where: { processAreaId: paId },
    orderBy: { attestedAt: "desc" },
    select: { attestedAt: true },
  });
  const cadenceDays = resolveCadenceDays(company.attestationCadenceDays);
  const { nextDue, state } = deriveAttestationState({
    lastAttestedAt: last?.attestedAt ?? null,
    goLiveAt: company.createdAt,
    cadenceDays,
    now: new Date(),
  });
  return {
    processAreaId: paId,
    name: pa.name,
    state,
    nextDue: nextDue.toISOString(),
    lastAttestedAt: last ? last.attestedAt.toISOString() : null,
    cadenceDays,
  };
}

/* ── Access / recipient helpers ──────────────────────────────────────────── */

/**
 * MIC company-access gate — STRICTER than authz.hasCompanyAccess (whose role=Admin
 * is global). For MIC the SPO must be a MEMBER of the company: role Admin/
 * Superuser/Assessor AND (`user.companyId === companyId` OR a UserCompany mapping).
 * This guarantees the cross-tenant attest → 403 holds for EVERY role, including
 * Admin, so a company-A SPO can never attest a company-B process area.
 */
export async function hasMicCompanyAccess(userId: string | null, companyId: string | null): Promise<boolean> {
  if (!userId || !companyId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true, userCompanies: { select: { companyId: true } } },
  });
  if (!user) return false;
  if (user.role !== "Admin" && user.role !== "Superuser" && user.role !== "Assessor") return false;
  if (user.companyId === companyId) return true;
  return user.userCompanies.some((uc) => uc.companyId === companyId);
}

/** SPO recipient ids: active users with MIC company access (role Admin/Assessor/Superuser). */
export async function companySPOUserIds(companyId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["Admin", "Assessor", "Superuser"] },
      OR: [{ companyId }, { userCompanies: { some: { companyId } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
