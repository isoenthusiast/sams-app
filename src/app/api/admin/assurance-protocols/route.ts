import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// ── GET — list assurance protocols with optional filters ────────────
export async function GET(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const companyId = await getSelectedCompanyId();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const processAreaName = searchParams.get("processAreaName") || "";
    const requirementId = searchParams.get("requirementId") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50")));

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (processAreaName) where.processAreaName = processAreaName;
    if (requirementId) where.requirementId = { contains: requirementId, mode: "insensitive" };
    if (search) {
      where.OR = [
        { requirementId: { contains: search, mode: "insensitive" } },
        { processAreaName: { contains: search, mode: "insensitive" } },
        { objective: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.assuranceProtocol.findMany({
        where,
        orderBy: [{ processAreaName: "asc" }, { reqNo: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assuranceProtocol.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("GET /api/admin/assurance-protocols error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
