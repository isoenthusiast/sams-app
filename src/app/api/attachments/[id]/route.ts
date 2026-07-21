import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";

// DELETE — only admin or the uploader can delete
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    const userRole = (session.user as { role?: string }).role;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { mappings: true },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Only admin or the uploader (by name match) can delete
    const userName = (session.user as { name?: string }).name;
    if (userRole !== "Admin" && attachment.uploadedBy !== userName) {
      return NextResponse.json({ error: "Only admin or the uploader can delete this attachment" }, { status: 403 });
    }

    // Delete file
    try {
      const filePath = path.join(process.cwd(), "public", attachment.filePath);
      await unlink(filePath);
    } catch { /* file may not exist */ }

    // Delete mappings and attachment (cascade handles mappings)
    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
