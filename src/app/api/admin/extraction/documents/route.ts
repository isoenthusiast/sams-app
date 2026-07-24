import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/extraction/documents
 * List all uploaded documents with status and candidate counts.
 */
export async function GET() {
  try {
    const docs = await prisma.$queryRawUnsafe<Array<{
      id: string; "documentTitle": string; "documentType": string;
      "Status": string; "createdAt": string; candidateCount: number;
    }>>(
      `SELECT d.id, d."documentTitle", d."documentType", d."Status", d."createdAt",
              COUNT(c.id)::int as "candidateCount"
       FROM "DocumentExtract" d
       LEFT JOIN "ControlFromDocument" c ON c."documentExtractId" = d.id
       GROUP BY d.id
       ORDER BY d."createdAt" DESC`
    );

    return NextResponse.json(docs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
