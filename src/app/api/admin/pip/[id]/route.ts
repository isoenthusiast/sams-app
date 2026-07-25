import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

/**
 * PATCH /api/admin/pip/[id] — update PIP item (status, fields, control links)
 * DELETE /api/admin/pip/[id] — delete PIP item
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;
    const { id } = await params;
    const body = await request.json();
    const { pipStatus, title, description, priority, targetDate, source, riskAcceptance, alarpRationale, controlIds } = body;

    const data: any = {};
    if (pipStatus !== undefined) data.pipStatus = pipStatus;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (priority !== undefined) data.priority = priority;
    if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null;
    if (source !== undefined) data.source = source;
    if (riskAcceptance !== undefined) data.riskAcceptance = riskAcceptance;
    if (alarpRationale !== undefined) data.alarpRationale = alarpRationale;

    // If controlIds provided, replace all links
    if (controlIds !== undefined) {
      await prisma.backlogItemControl.deleteMany({ where: { backlogItemId: id } });
      if (controlIds.length > 0) {
        await prisma.backlogItemControl.createMany({
          data: controlIds.map((cid: string) => ({ backlogItemId: id, controlId: cid })),
        });
      }
    }

    const item = await prisma.backlogItem.update({
      where: { id },
      data,
      include: { controlLinks: { include: { control: { select: { id: true, name: true } } } } },
    });
    return NextResponse.json(item);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;
    const { id } = await params;
    await prisma.backlogItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
