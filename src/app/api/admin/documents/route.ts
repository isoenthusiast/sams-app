import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const documents = await prisma.document.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
}
