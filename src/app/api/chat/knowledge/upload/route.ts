import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { extractText } from "@/lib/extractText";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string[]> = {
  document: [".pdf", ".md", ".csv", ".txt", ".docx"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"],
};

/**
 * POST /api/chat/knowledge/upload
 * Upload a document or image to the AI assistant context.
 * Documents → text extraction → Document table.
 * Images → GPT-4o-mini vision → text description → Document table.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const processAreaId = (formData.get("processAreaId") as string) || null;
    const companyId = (formData.get("companyId") as string) || null;
    const folderParam = (formData.get("folder") as string) || null;
    const folder = folderParam === "Uploaded" ? "Uploaded" : "AI Chat";
    const source = folderParam === "Uploaded" ? "upload" : "chat_upload";

    if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });

    const fileName = file.name.toLowerCase();
    const ext = fileName.substring(fileName.lastIndexOf("."));
    const isImage = ALLOWED_TYPES.image.includes(ext);
    const isDoc = ALLOWED_TYPES.document.includes(ext);
    if (!isImage && !isDoc) {
      return NextResponse.json({ error: `Unsupported type: ${ext}. Allowed: ${[...ALLOWED_TYPES.document, ...ALLOWED_TYPES.image].join(", ")}` }, { status: 400 });
    }

    let content = "";
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isImage) {
      // ── Image: GPT-4o-mini vision ──
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });

      const base64 = buffer.toString("base64");
      const dataUri = `data:image/${ext.replace(".", "")};base64,${base64}`;

      const visionResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in detail. Extract any text, labels, diagrams, or procedures visible. Format as markdown. Be thorough — this will be stored as a searchable document." },
                { type: "image_url", image_url: { url: dataUri } },
              ],
            },
          ],
          max_tokens: 2000,
        }),
      });

      if (!visionResp.ok) {
        const err = await visionResp.text();
        return NextResponse.json({ error: `Vision API error: ${visionResp.status} — ${err.substring(0, 200)}` }, { status: 502 });
      }

      const visionData = await visionResp.json();
      content = visionData.choices?.[0]?.message?.content || "[Image could not be analyzed]";
    } else {
      // ── Document: text extraction (shared helper) ──
      content = await extractText(buffer, file.name);
    }

    if (!content || content.trim().length < 10) {
      return NextResponse.json({ error: "Could not extract sufficient content" }, { status: 422 });
    }

    // ── Store in Document table ──
    const summary = content.substring(0, 300).replace(/\n/g, " ");
    const docId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Document" (id, filename, "documentContent", "source", "companyId", "folder", "processAreaId", "summary", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      docId, file.name, content, source, companyId, folder, processAreaId, summary
    );

    return NextResponse.json({ documentId: docId, filename: file.name, summary });
  } catch (err: any) {
    console.error("[chat/upload] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
