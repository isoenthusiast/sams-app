import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { extractText } from "@/lib/extractText";

const MAX_TEXT_LENGTH = 500_000;

/**
 * POST /api/admin/knowledgebase/transcript
 * Admin-only meeting-transcript upload: file (or pasted text) → extract text →
 * Knowledgebase entry (entryType=Transcript) with company-scoped tags.
 */
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const content = (formData.get("content") as string) || "";
    const title = (formData.get("title") as string) || "";
    const companyId = (formData.get("companyId") as string) || "";
    const processAreaId = (formData.get("processAreaId") as string) || null;
    const meetingDateRaw = (formData.get("meetingDate") as string) || "";
    const participants = (formData.get("participants") as string) || "";
    const tagFields = formData.getAll("tags") as string[];

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    // Resolve transcript text (file wins over pasted content)
    let text = "";
    let name = title;
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractText(buffer, file.name);
      if (!name.trim()) name = file.name.replace(/\.[^.]+$/, "");
    } else if (content.trim()) {
      text = content;
    }

    if (!name.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "Could not extract sufficient content" }, { status: 422 });
    }
    if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);

    // Parse optional meeting date
    let meetingDate: Date | null = null;
    if (meetingDateRaw) {
      const d = new Date(meetingDateRaw);
      if (!isNaN(d.getTime())) meetingDate = d;
    }

    // Create the KB entry as a Transcript
    const created = await prisma.knowledgebase.create({
      data: {
        knowledgeName: name,
        knowledgeContent: text,
        entryType: "Transcript",
        meetingDate,
        participants: participants.trim() || null,
        companyId,
        processAreaId,
        addedBy: (session as any)?.user?.name || "Admin",
      },
    });

    // Upsert + link company-scoped tags
    const tagNames = [
      ...new Set(tagFields.flatMap((t) => t.split(",").map((s) => s.trim()).filter(Boolean))),
    ];
    for (const tagName of tagNames) {
      const tag = await prisma.tag.upsert({
        where: { name_companyId: { name: tagName, companyId } },
        create: { name: tagName, companyId },
        update: {},
      });
      await prisma.knowledgebaseTag.upsert({
        where: { kID_tagId: { kID: created.kID, tagId: tag.id } },
        create: { kID: created.kID, tagId: tag.id },
        update: {},
      });
    }

    return NextResponse.json(
      { kID: created.kID, knowledgeName: created.knowledgeName },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[transcript/upload] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/knowledgebase/transcript?companyId=…
 * Admin-only list of transcripts (with tags).
 */
export async function GET(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    const transcripts = await prisma.knowledgebase.findMany({
      where: { entryType: "Transcript", ...(companyId ? { companyId } : {}) },
      orderBy: { createdDate: "desc" },
      include: { tags: { include: { tag: true } } },
    });

    return NextResponse.json({
      transcripts: transcripts.map((t) => ({
        kID: t.kID,
        knowledgeName: t.knowledgeName,
        knowledgeContent: t.knowledgeContent,
        meetingDate: t.meetingDate,
        participants: t.participants,
        createdDate: t.createdDate,
        addedBy: t.addedBy,
        processAreaId: t.processAreaId,
        tags: t.tags.map((kt) => kt.tag.name),
      })),
    });
  } catch (err: any) {
    console.error("[transcript/list] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
