import { requireAuth, requireAssessor } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// GET — list attachments for a specific record
export async function GET(request: Request) {
  try {
    const { session, response } = await requireAuth();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const destTable = searchParams.get("destTable");
    const recId = searchParams.get("recId");

    if (!destTable || !recId) {
      return NextResponse.json({ error: "destTable and recId required" }, { status: 400 });
    }

    const mappings = await prisma.attachmentMapping.findMany({
      where: { destTable, recId },
      include: { attachment: true },
      orderBy: { attachment: { uploadDate: "desc" } },
    });

    return NextResponse.json(mappings.map(m => m.attachment).filter(Boolean));
  } catch (error) {
    console.error("Error fetching attachments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — upload and link attachment
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAssessor();
    if (response) return response;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const description = formData.get("description")?.toString() || null;
    const destTable = formData.get("destTable")?.toString();
    const recId = formData.get("recId")?.toString();

    if (!file || !destTable || !recId) {
      return NextResponse.json({ error: "file, destTable, and recId required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${timestamp}_${safeName}`;

    const uploadDir = path.join(process.cwd(), "public", "attachments");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const attachment = await prisma.attachment.create({
      data: {
        description,
        fileName: file.name,
        filePath: `/attachments/${filename}`,
        fileSize: file.size,
        uploadedBy: (session.user as { name?: string }).name || session.user.id || "unknown",
        mappings: {
          create: { destTable, recId },
        },
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
