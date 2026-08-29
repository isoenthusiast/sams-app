import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

/**
 * DELETE /api/admin/knowledgebase/transcript/[id]
 * Admin-only hard delete of a transcript (and its tag links).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Remove tag links first, then the entry (explicit, no DB cascade assumed)
    await prisma.knowledgebaseTag.deleteMany({ where: { kID: id } });
    await prisma.knowledgebase.delete({ where: { kID: id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[transcript/delete] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
