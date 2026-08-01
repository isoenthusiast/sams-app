import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/admin/assessments/[id]/checklist-controls?itemId=X
// Returns suggested + linked controls for a checklist item.
// Computes relevance scores on-the-fly via keyword matching.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: assessmentId } = await params;
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");

  if (!itemId) return NextResponse.json({ error: "itemId query param required" }, { status: 400 });

  // Get the checklist item
  const item = await prisma.auditChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, checklistItemId: true, checklistText: true, auditStandard: true },
  });
  if (!item) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });

  // Get the assessment's company
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { companyId: true },
  });

  // Get all controls assigned to this assessment
  const assignments = await prisma.controlAssignment.findMany({
    where: { assessmentId },
    include: {
      control: {
        select: {
          id: true,
          name: true,
          statement: true,
          controlType: true,
          processArea: { select: { name: true } },
        },
      },
    },
  });

  // Get already-linked controls
  const linked = await prisma.assessmentChecklistControl.findMany({
    where: { checklistItemId: itemId },
    select: { id: true, controlId: true, relevanceScore: true },
  });
  const linkedMap = new Map(linked.map((l) => [l.controlId, { junctionId: l.id, score: l.relevanceScore }]));

  // Keyword relevance engine
  const itemWords = new Set(
    `${item.checklistText} ${item.checklistItemId}`.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  );

  const scored = assignments.map((a) => {
    const ctrl = a.control;
    const ctrlText = `${ctrl.name} ${ctrl.statement ?? ""} ${ctrl.processArea?.name ?? ""}`.toLowerCase();
    const ctrlWords = ctrlText.split(/\W+/).filter((w) => w.length > 2);

    let matches = 0;
    for (const w of itemWords) {
      if (ctrlWords.includes(w)) matches++;
    }
    const score = itemWords.size > 0 ? Math.round((matches / itemWords.size) * 100) : 0;

    const linkedEntry = linkedMap.get(ctrl.id);
    return {
      controlId: ctrl.id,
      controlName: ctrl.name,
      controlStatement: ctrl.statement?.substring(0, 150) ?? "",
      controlType: ctrl.controlType,
      processArea: ctrl.processArea?.name ?? "",
      score,
      isLinked: linkedEntry !== undefined,
      junctionId: linkedEntry?.junctionId ?? null,
    };
  });

  // Sort by score descending, linked first
  scored.sort((a, b) => {
    if (a.isLinked !== b.isLinked) return a.isLinked ? -1 : 1;
    return b.score - a.score;
  });

  return NextResponse.json({
    itemId: item.id,
    checklistItemId: item.checklistItemId,
    controls: scored,
  });
}

// POST /api/admin/assessments/[id]/checklist-controls
// Links a control to a checklist item.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: assessmentId } = await params;
  const body = await request.json();
  const { checklistItemId, controlId, relevanceScore } = body;

  if (!checklistItemId || !controlId) {
    return NextResponse.json({ error: "checklistItemId and controlId required" }, { status: 400 });
  }

  // Check for duplicate
  const existing = await prisma.assessmentChecklistControl.findFirst({
    where: { checklistItemId, controlId },
  });
  if (existing) {
    return NextResponse.json({ error: "Already linked" }, { status: 409 });
  }

  const link = await prisma.assessmentChecklistControl.create({
    data: {
      checklistItemId,
      controlId,
      assessmentId,
      relevanceScore: relevanceScore ?? 0,
      isLinked: true,
    },
  });

  return NextResponse.json({ link }, { status: 201 });
}
