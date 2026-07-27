import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssessor, requireAdmin, getSelectedCompanyId, MASTER_COMPANY_ID } from "@/lib/authz";

// PATCH /api/documents/[id] — edit summary (any non-Interviewee)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAssessor();
  if (response) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const summary = typeof body.summary === "string" ? body.summary.trim() : null;

  const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
  if (!doc || doc.archivedAt) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.document.update({ where: { id }, data: { summary: summary || null } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/documents/[id] — soft-delete (archive). Admin only.
// Shared (SAMS001) documents can only be archived while SAMS001 is the selected company.
// Note: companyId columns store Company.id (cuid), not the companyID code.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, companyId: true, archivedAt: true } });
  if (!doc || doc.archivedAt) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const master = await prisma.company.findUnique({ where: { companyID: MASTER_COMPANY_ID }, select: { id: true } });
  if (master && doc.companyId === master.id) {
    const selected = await getSelectedCompanyId();
    if ((selected ?? master.id) !== master.id) {
      return NextResponse.json(
        { error: "Shared (SAMS001) documents can only be archived while SAMS001 is the selected company" },
        { status: 403 }
      );
    }
  }

  await prisma.document.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
