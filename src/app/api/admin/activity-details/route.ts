import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create or update activity details (upsert by aaId)
export async function POST(request: Request) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const body = await request.json();
    const { aaId, checklists, activityNotes, detail, summaryAgainstControls } = body;

    if (!aaId) {
      return NextResponse.json({ error: "aaId is required" }, { status: 400 });
    }

    const existing = await prisma.aActDetails.findFirst({ where: { aaId } });

    let details;
    if (existing) {
      details = await prisma.aActDetails.update({
        where: { id: existing.id },
        data: {
          checklists: checklists ?? existing.checklists,
          activityNotes: activityNotes ?? existing.activityNotes,
          detail: detail ?? existing.detail,
          summaryAgainstControls: summaryAgainstControls ?? existing.summaryAgainstControls,
        },
      });
    } else {
      details = await prisma.aActDetails.create({
        data: {
          id: `aad_${Date.now()}`,
          aactDetID: `AAD-${Date.now()}`,
          aaId,
          checklists: checklists || null,
          activityNotes: activityNotes || null,
          detail: detail || null,
          summaryAgainstControls: summaryAgainstControls || null,
        },
      });
    }

    return NextResponse.json({ details });
  } catch (error) {
    console.error("Error saving activity details:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
