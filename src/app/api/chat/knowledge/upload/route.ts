import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { writeFile, unlink, readFile, mkdir } from "fs/promises";
import { join } from "path";
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
      // ── Document: text extraction ──
      const tempDir = join(process.cwd(), "uploads");
      try { await mkdir(tempDir, { recursive: true }); } catch { /* exists */ }
      const tempPath = join(tempDir, `${randomUUID()}${ext}`);
      await writeFile(tempPath, buffer);

      try {
        if (ext === ".pdf") {
          const { PDFParse } = await import("pdf-parse");
          const pdfBuffer = await readFile(tempPath);
          const pdfParser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
          content = (await pdfParser.getText()).text;
          await pdfParser.destroy();
        } else if (ext === ".docx") {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ path: tempPath });
          content = result.value;
        } else if (ext === ".csv") {
          const csvText = await readFile(tempPath, "utf-8");
          const lines = csvText.trim().split("\n");
          if (lines.length > 0) {
            const headers = lines[0].split(",").map(h => h.trim());
            content = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
            for (let i = 1; i < Math.min(lines.length, 500); i++) {
              content += `| ${lines[i].split(",").map(c => c.trim()).join(" | ")} |\n`;
            }
          }
        } else {
          content = await readFile(tempPath, "utf-8");
        }
      } finally {
        try { await unlink(tempPath); } catch { /* ignore */ }
      }
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
