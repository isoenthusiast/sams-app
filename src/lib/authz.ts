import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createChainedActivityLog } from "@/lib/audit-chain";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const MASTER_COMPANY_ID = "SAMS001";

export type SessionUser = {
  id?: string;
  name?: string | null;
  role?: string;
};

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (session.user.role !== "Admin") {
    return { session: null, response: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { session, response: null };
}

export async function requireSuperuser() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const role = session.user.role;
  if (role !== "Admin" && role !== "Superuser") {
    return { session: null, response: NextResponse.json({ error: "Superuser access required" }, { status: 403 }) };
  }
  return { session, response: null };
}

/** Require at least Assessor (Admin, Superuser, or Assessor). Interviewees excluded. */
export async function requireAssessor() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const role = session.user.role;
  if (role !== "Admin" && role !== "Superuser" && role !== "Assessor") {
    return { session: null, response: NextResponse.json({ error: "Assessor access required" }, { status: 403 }) };
  }
  return { session, response: null };
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return { session, response: null };
}

/** Require the provider plane: session.user.providerRole must be set. */
export function isProvider(session: { user?: object } | null) {
  return !!(session?.user && (session.user as { providerRole?: string | null }).providerRole);
}

export async function requireProvider() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const providerRole = (session.user as { providerRole?: string | null }).providerRole;
  if (!providerRole) {
    return { session: null, response: NextResponse.json({ error: "Provider access required" }, { status: 403 }) };
  }
  return { session, response: null };
}

/**
 * Require the caller be an assessor OR provider-plane staff. Assessors drive the
 * evidence-request lifecycle (send/accept/reject/na) and post provider-plane
 * comments; provider staff (Operator Console) hold this authority regardless of
 * their client `role`. Interviewees are excluded — they are requestees who only
 * `submit`.
 */
export async function requireAssessorOrProvider() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const role = session.user.role;
  const isAssessorRole = role === "Admin" || role === "Superuser" || role === "Assessor";
  const isProviderPlane = !!(session.user as { providerRole?: string | null }).providerRole;
  if (!isAssessorRole && !isProviderPlane) {
    return { session: null, response: NextResponse.json({ error: "Assessor or provider access required" }, { status: 403 }) };
  }
  return { session, response: null };
}

export async function getSelectedCompanyId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("selectedCompanyId")?.value || null;
  } catch {
    return null;
  }
}

export async function hasCompanyAccess(userId: string | undefined, companyId: string | null | undefined): Promise<boolean> {
  if (!userId || !companyId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "Admin") return true;
  const mapping = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  return !!mapping;
}

export async function requireSelectedCompany(sessionUser: SessionUser) {
  const companyId = await getSelectedCompanyId();
  if (!companyId) {
    return { companyId: null, response: null };
  }
  const ok = await hasCompanyAccess(sessionUser.id, companyId);
  if (!ok) {
    return { companyId: null, response: NextResponse.json({ error: "Access denied for selected company" }, { status: 403 }) };
  }
  return { companyId, response: null };
}

export async function getCompanyWhere(sessionUser: SessionUser, tableField = "companyId") {
  const { companyId, response } = await requireSelectedCompany(sessionUser);
  if (response) return { where: null, response };
  if (!companyId) {
    if (sessionUser.role !== "Admin") {
      return { where: { [tableField]: "__NO_ACCESS__" }, response: null };
    }
    return { where: {}, response: null };
  }
  return { where: { [tableField]: companyId }, response: null };
}

// ── Activity Logging ──────────────────────────────────────────────────────

export async function logActivity(params: {
  userId: string;
  username?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
  companyId?: string | null;
}) {
  // SAMS-015: now CHAINED — every ActivityLog write routes through the shared
  // chained helper (same canonicalization / ordering / per-company lock as the
  // backfill and verifier). The raw-INSERT form maps onto the entry shape:
  //   description=summary, activityType=action, username, refTable=entityType,
  //   refRecord=entityId, beforeData=null, afterData=metadata.
  const id = await createChainedActivityLog({
    activityType: params.action,
    description: params.summary,
    username: params.username ?? params.userId,
    refTable: params.entityType,
    refRecord: params.entityId,
    beforeData: null,
    afterData: (params.metadata as Record<string, unknown>) ?? undefined,
    companyId: params.companyId ?? null,
  });
  if (id === null) {
    console.error("[ActivityLog] Failed to write log:", params);
  }
}

export async function requireCompanyIdAccess(sessionUser: SessionUser, companyId: string | null | undefined) {
  if (!companyId) {
    return { response: NextResponse.json({ error: "Company ID required" }, { status: 400 }) };
  }
  const ok = await hasCompanyAccess(sessionUser.id, companyId);
  if (!ok) {
    return { response: NextResponse.json({ error: "Access denied for company" }, { status: 403 }) };
  }
  return { response: null };
}
