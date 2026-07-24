import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/extraction/upload
 *
 * Upload a document for AI extraction. Accepts .pdf, .md, .txt, .csv, .docx.
 * Extracts text content and stores it for later AI processing.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "Admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const documentTitle = (formData.get("title") as string) || file?.name || "Untitled";
    const documentType = (formData.get("documentType") as string) || "Policy";
    const companyId = (formData.get("companyId") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Extract text based on file type
    let content = "";
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".md") || fileName.endsWith(".txt") || fileName.endsWith(".csv")) {
      content = await file.text();
    } else if (fileName.endsWith(".pdf")) {
      // Basic PDF text extraction — in production, use pdf-parse
      content = `[PDF: ${file.name}] — PDF text extraction requires pdf-parse library. Upload as .md or .txt for now.`;
    } else if (fileName.endsWith(".docx")) {
      content = `[DOCX: ${file.name}] — DOCX extraction requires mammoth library. Upload as .md or .txt for now.`;
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use .md, .txt, .csv, .pdf, or .docx." }, { status: 400 });
    }

    // Insert via raw SQL (tables managed outside Prisma)
    const result = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "DocumentExtract" (id, "documentTitle", "documentType", content, "Status", "companyId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'Uploaded', $4, NOW(), NOW())
       RETURNING id`,
      documentTitle, documentType, content, companyId
    );

    return NextResponse.json({
      success: true,
      documentId: result[0].id,
      title: documentTitle,
      contentLength: content.length,
    });
  } catch (err: any) {
    console.error("[extraction/upload] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
