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
          requirementId: string;
          requirementText: string;
          controlId: string;
          controlName: string;
          controlType: string;
          sourceFile: string;
        }>
      >(
        `SELECT 
          r."requirementId",
          LEFT(r."clauseContent", 200) as "requirementText",
          c.id as "controlId",
          c.name as "controlName",
          c."controlType",
          c."sourceFile"
        FROM "AuditChecklist2Requirement" acr
        JOIN "Requirement" r ON acr."requirementRId" = r."rID"
        LEFT JOIN "Control" c ON acr."controlId" = c.id
        WHERE acr."checklistItemId" = $1 AND acr."auditStandard" = $2
        LIMIT 10`,
        item.checklistItemId,
        item.auditStandard
      );

      return {
        id: item.id,
        checklistItemId: item.checklistItemId,
        checklistText: item.checklistText,
        auditStandard: item.auditStandard,
        complianceStatus: item.complianceStatus,
        auditorNotes: item.auditorNotes,
        testedDate: item.testedDate?.toISOString() ?? null,
        testedBy: item.testedBy,
        evidenceMethod: item.evidenceMethod,
        sortOrder: item.sortOrder,
        mappedControls: mappings,
      };
    })
  );

  return NextResponse.json(enriched);
}
