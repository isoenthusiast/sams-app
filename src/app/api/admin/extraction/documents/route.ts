import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/extraction/documents
 * List all uploaded documents with candidate counts.
 */
export async function GET() {
  try {
    const docs = await prisma.$queryRawUnsafe<Array<{
      id: string; filename: string; "documentType": string;
      "createdAt": string; candidateCount: number;
    }>>(
      `SELECT d.id, d.filename, d."documentType", d."createdAt",
              COUNT(c.id)::int as "candidateCount"
       FROM "Document" d
       LEFT JOIN "ControlFromDocument" c ON c."documentId" = d.id
       GROUP BY d.id
       ORDER BY d."createdAt" DESC`
    );

    return NextResponse.json(docs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
