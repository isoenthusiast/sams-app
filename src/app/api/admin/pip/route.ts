import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

/**
 * GET /api/admin/pip?processAreaId=X — list PIP items for a PA
 * POST /api/admin/pip — create a new PIP item
 */
export async function GET(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;
    const { searchParams } = new URL(request.url);
    const processAreaId = searchParams.get("processAreaId");
    if (!processAreaId) return NextResponse.json({ error: "processAreaId required" }, { status: 400 });

    const items = await prisma.backlogItem.findMany({
      where: { isPIP: true, processAreaId },
      orderBy: { createdAt: "desc" },
      include: {
        controlLinks: { include: { control: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json(items);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const body = await request.json();
    const { title, description, processAreaId, priority, targetDate, source, riskAcceptance, alarpRationale, controlIds } = body;
    if (!title || !processAreaId) return NextResponse.json({ error: "title and processAreaId required" }, { status: 400 });

    const userName = session?.user?.name || "admin";
    const item = await prisma.backlogItem.create({
      data: {
        title,
        description: description || null,
        type: "Task",
        isPIP: true,
        pipStatus: "Proposed",
        processAreaId,
        priority: priority || 5,
        targetDate: targetDate ? new Date(targetDate) : null,
        source: source || null,
        riskAcceptance: riskAcceptance || false,
        alarpRationale: alarpRationale || null,
        createdBy: userName,
        companyId: null,
        controlLinks: controlIds?.length ? {
          create: controlIds.map((cid: string) => ({ controlId: cid })),
        } : undefined,
      },
      include: { controlLinks: { include: { control: { select: { id: true, name: true } } } } },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
