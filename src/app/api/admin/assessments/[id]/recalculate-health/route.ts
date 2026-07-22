import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — recalculate control health for all controls assigned to this assessment
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id: assessmentId } = await params;

    // Get all controls assigned to this assessment
    const assignments = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "controlId" FROM "ControlAssignment" WHERE "assessmentId" = $1`,
      assessmentId
    );

    if (assignments.length === 0) {
      return NextResponse.json({ message: "No controls assigned", updated: 0 });
    }

    const controlIds = assignments.map((a: any) => a.controlId);

    // For each control, find outstanding actions linked through findings
    // Outstanding = actionClosureEffective = false
    // Link: Control ← Finding (via controlIds) ← Action (via findingId)
    const results: any[] = [];

    for (const controlId of controlIds) {
      // Find all findings that reference this control
      // Finding.controlIds is a comma-separated string of control IDs
      const findings = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, severity, repeat FROM "Finding"
         WHERE "assessmentId" = $1
         AND ("controlIds" LIKE $2 OR "controlIds" LIKE $3)`,
        assessmentId,
        `%${controlId}%`,
        `%${controlId}%`
      );

      let deduction = 0;
      const deductionDetails: string[] = [];

      for (const f of findings) {
        // Find outstanding actions for this finding
        const actions = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, "actionDescription", "actionClosureEffective"
           FROM "Action"
           WHERE "findingId" = $1 AND "actionClosureEffective" = false`,
          f.id
        );

        for (const a of actions) {
          const sev = f.severity;
          const isRepeat = f.repeat;
          let d = 0;

          if (isRepeat || sev === "Serious") d = 15;
          else if (sev === "High") d = 10;
          else if (sev === "Medium") d = 5;
          // Low = 0

          deduction += d;
          if (d > 0) {
            deductionDetails.push(`${sev}${isRepeat ? "/Repeat" : ""}: -${d}% (${a.actionDescription?.slice(0, 40)})`);
          }
        }
      }

      // Calculate new health score (max 100, min 0)
      const newScore = Math.max(0, 100 - deduction);

      // Update control
      await prisma.$executeRawUnsafe(
        `UPDATE "Control" SET "rawHealthScore" = $1, "lastTestedDate" = NOW() WHERE id = $2`,
        newScore, controlId
      );

      results.push({
        controlId,
        newScore,
        deduction,
        details: deductionDetails,
      });
    }

    return NextResponse.json({
      message: `Recalculated ${results.length} controls`,
      updated: results.length,
      results,
    });
  } catch (error) {
    console.error("Error recalculating health:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
