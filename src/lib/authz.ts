import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
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
