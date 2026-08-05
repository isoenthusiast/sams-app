import { NextRequest, NextResponse } from "next/server";
import { requireSuperuser, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/assessments/[id] — cascade delete assessment + all children
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const companyId = await getSelectedCompanyId();

    // Verify assessment exists and belongs to company
    const assessment = await prisma.assessment.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

    // Cascade delete via raw SQL for reliability
    const deletes: string[] = [];

    // 1. Actions (child of Finding)
    deletes.push(`DELETE FROM "Action" WHERE "findingId" IN (SELECT id FROM "Finding" WHERE "assessmentId" = '${id}')`);
    // 2. AuditChecklist2Requirement
    deletes.push(`DELETE FROM "AuditChecklist2Requirement" WHERE "checklistItemId" IN (SELECT id FROM "AuditChecklistItem" WHERE "assessmentId" = '${id}')`);
    // 3. AssessmentChecklistControl
    deletes.push(`DELETE FROM "AssessmentChecklistControl" WHERE "assessmentId" = '${id}'`);
    // 4. AuditChecklistItem
    deletes.push(`DELETE FROM "AuditChecklistItem" WHERE "assessmentId" = '${id}'`);
    // 5. Sample
    deletes.push(`DELETE FROM "Sample" WHERE "assessmentId" = '${id}'`);
    // 6. Finding
    deletes.push(`DELETE FROM "Finding" WHERE "assessmentId" = '${id}'`);
    // 7. AssessmentAssessor
    deletes.push(`DELETE FROM "AssessmentAssessor" WHERE "assessmentId" = '${id}'`);
    // 8. ControlAssignment
    deletes.push(`DELETE FROM "ControlAssignment" WHERE "assessmentId" = '${id}'`);
    // 9. Assessment (parent)
    deletes.push(`DELETE FROM "Assessment" WHERE id = '${id}'`);

    let totalDeleted = 0;
    for (const sql of deletes) {
      const result: any = await prisma.$executeRawUnsafe(sql);
      totalDeleted += result;
    }

    return NextResponse.json({ deleted: true, id, rowsAffected: totalDeleted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
