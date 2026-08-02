import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET /api/admin/assessments/[id]/checklist
// Returns all AuditChecklistItems for this assessment, with mapped requirements and controls.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: assessmentId } = await params;

  const items = await prisma.auditChecklistItem.findMany({
    where: { assessmentId },
    orderBy: [{ auditStandard: "asc" }, { sortOrder: "asc" }],
  });

  // For each item, fetch mapped requirements and controls from AuditChecklist2Requirement
  const enriched = await Promise.all(
    items.map(async (item) => {
      // Find requirement mappings via the ACR junction (by checklistItemId string match)
      // Note: ACR maps by checklistItemId string, not FK — query the view or direct
      const mappings = await prisma.$queryRawUnsafe<
        Array<{
          mappingId: string;
          requirementId: string;
          requirementText: string;
          requirementClause: string;
          requirementRId: number;
          controlId: string;
          controlName: string;
          controlType: string;
          sourceFile: string;
        }>
      >(
        `SELECT 
          acr.id as "mappingId",
          r."requirementId",
          LEFT(r."clauseContent", 300) as "requirementText",
          r."clauseContent" as "requirementClause",
          r."rID" as "requirementRId",
          c.id as "controlId",
          c.name as "controlName",
          c."controlType",
          c."sourceFile"
        FROM "AuditChecklist2Requirement" acr
        JOIN "Requirement" r ON acr."requirementRId" = r."rID"
        LEFT JOIN "Control" c ON acr."controlId" = c.id
        WHERE acr."checklistItemId" = $1 AND acr."auditStandard" = $2
        ORDER BY r."requirementId", c.name
        LIMIT 30`,
        item.checklistItemId,
        item.auditStandard
      );

      return {
        id: item.id,
        checklistItemId: item.checklistItemId,
        checklistText: item.checklistText,
        auditStandard: item.auditStandard,
        templateId: item.templateId,
        complianceStatus: item.complianceStatus,
        auditorNotes: item.auditorNotes,
        testedDate: item.testedDate?.toISOString() ?? null,
        testedBy: item.testedBy,
        evidenceMethod: item.evidenceMethod,
        keyQuestions: item.keyQuestions,
        whatGoodLooksLike: item.whatGoodLooksLike,
        controlPoints: item.controlPoints,
        evidenceRequirements: item.evidenceRequirements,
        sortOrder: item.sortOrder,
        mappedControls: mappings.map((m: any) => ({
          mappingId: m.mappingId,
          requirementId: m.requirementId,
          requirementText: m.requirementText,
          requirementClause: m.requirementClause,
          requirementRId: m.requirementRId,
          controlId: m.controlId,
          controlName: m.controlName,
          controlType: m.controlType,
          sourceFile: m.sourceFile,
        })),
      };
    })
  );

  return NextResponse.json(enriched);
}
