import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — list documents linked to a requirement, or requirements linked to a document
export async function GET(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const requirementRId = searchParams.get("requirementRId");
  const documentId = searchParams.get("documentId");

  if (!requirementRId && !documentId) {
    return NextResponse.json({ error: "requirementRId or documentId required" }, { status: 400 });
  }

  if (requirementRId) {
    const links = await prisma.mapRequirement2Document.findMany({
      where: { requirementRId: parseInt(requirementRId) },
      include: { document: true },
      orderBy: { linkedAt: "desc" },
    });
    return NextResponse.json({ links, total: links.length });
  }

  if (documentId) {
    const links = await prisma.mapRequirement2Document.findMany({
      where: { documentId },
      include: { requirement: true },
      orderBy: { linkedAt: "desc" },
    });
    return NextResponse.json({ links, total: links.length });
  }
}

// POST — link a document to a requirement
export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  const { requirementRId, documentId } = body;
  if (!requirementRId || !documentId) {
    return NextResponse.json({ error: "requirementRId and documentId required" }, { status: 400 });
  }

  const link = await prisma.mapRequirement2Document.create({
    data: { requirementRId, documentId },
    include: { document: true },
  });

  return NextResponse.json({ link }, { status: 201 });
}

// DELETE — unlink a document from a requirement
export async function DELETE(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.mapRequirement2Document.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
