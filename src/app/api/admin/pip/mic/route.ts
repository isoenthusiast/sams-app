import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

/**
 * POST /api/admin/pip/mic — update MIC Statement for a Process Area
 */
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const body = await request.json();
    const { micStatement, processAreaId } = body;
    if (!processAreaId) return NextResponse.json({ error: "processAreaId required" }, { status: 400 });

    await prisma.processArea.update({
      where: { id: processAreaId },
      data: { micStatement: micStatement || "", micStatementUpdatedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
