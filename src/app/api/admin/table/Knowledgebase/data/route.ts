import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create a Knowledgebase entry
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { knowledgeName, knowledgeContent, processAreaId, companyId, addedBy } = body;

    if (!knowledgeName || !knowledgeContent) {
      return NextResponse.json({ error: "knowledgeName and knowledgeContent required" }, { status: 400 });
    }

    const kID = `kb_${Date.now()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Knowledgebase" ("kID", "knowledgeName", "knowledgeContent", "processAreaId", "companyId", "addedBy", "createdDate")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      kID, knowledgeName, knowledgeContent, processAreaId || null, companyId || null, addedBy || "Admin"
    );

    return NextResponse.json({ success: true, kID }, { status: 201 });
  } catch (error) {
    console.error("Error creating knowledgebase entry:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
