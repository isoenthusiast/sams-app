import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — list all backlog items, optionally filtered by status
export async function GET(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const companyId = await getSelectedCompanyId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    const items = await prisma.backlogItem.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching backlog:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a new backlog item
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const companyId = await getSelectedCompanyId();
    const body = await request.json();
    const { title, description, type, priority, justification, approach } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const item = await prisma.backlogItem.create({
      data: {
        title: title.trim(),
        description: description || null,
        type: type || "Task",
        status: "Backlog",
        priority: priority ?? 0,
        justification: justification || null,
        approach: approach || null,
        companyId,
        createdBy: session.user.name || session.user.id || "unknown",
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Error creating backlog item:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — update status, stage, priority, or fields of a backlog item
export async function PATCH(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const body = await request.json();
    const { id, status, stage, priority, title, description, type, justification, approach } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (stage !== undefined) data.stage = stage;
    if (priority !== undefined) data.priority = priority;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (type !== undefined) data.type = type;
    if (justification !== undefined) data.justification = justification;
    if (approach !== undefined) data.approach = approach;

    // Auto-manage stage: clear when leaving InProgress, set to PlanDesign when entering
    if (status === "InProgress" && stage === undefined) {
      // If moving to InProgress without specifying stage, default to PlanDesign
      const existing = await prisma.backlogItem.findUnique({ where: { id } });
      if (existing && existing.status !== "InProgress") {
        data.stage = "PlanDesign";
      }
    }
    if (status && status !== "InProgress") {
      data.stage = null;
    }

    const item = await prisma.backlogItem.update({
      where: { id },
      data,
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error updating backlog item:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove a backlog item
export async function DELETE(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.backlogItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting backlog item:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
