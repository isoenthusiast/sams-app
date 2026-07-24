import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

const EXTRACTION_PROMPT = `You are an assurance controls extraction expert. Extract all controls from the document below.

For each control, provide a structured JSON object with these fields:
- name: Short descriptive name of the control
- statement: What the control does (one sentence)
- controlType: One of [Administrative, Procedural, Analytical, Behavioral, Informational, Engineering]
- controlTypeDetail: More specific subtype
- csfWho: Who performs the control
- csfWhat: What is done
- csfWhen: When/how often
- csfWhere: Where it applies
- csfWhy: Why it exists (risk addressed)
- csfHow: How it's performed
- csfEvidence: What evidence proves it was done
- keyActivities: Key activities involved
- riskAddressed: Risk the control mitigates
- keyRiskIndicator: KRI if applicable
- isHsseCritical: true/false if HSSE critical
- standard: Applicable standard (ISO, API, etc.)
- requirements: Related requirements clause

Return ONLY valid JSON array. No markdown, no explanation. Format:
[{"name":"...", "statement":"...", ...}, ...]

If no controls found, return empty array [].

DOCUMENT:
`;

/**
 * POST /api/admin/extraction/extract
 *
 * Trigger AI extraction on an uploaded document.
 * Uses DeepSeek to extract structured controls from document text.
 * Idempotent: deletes previous candidates for this document before creating new ones.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "Admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Get document
    const docs = await prisma.$queryRawUnsafe<Array<{ id: string; content: string; "documentTitle": string; "Status": string }>>(
      `SELECT id, content, "documentTitle", "Status" FROM "DocumentExtract" WHERE id = $1`, documentId
    );
    if (!docs.length) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const doc = docs[0];

    if (!doc.content || doc.content.length < 10) {
      return NextResponse.json({ error: "Document has insufficient content for extraction" }, { status: 400 });
    }

    // Delete previous candidates (idempotent)
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ControlFromDocument" WHERE "documentExtractId" = $1`, documentId
    );

    // Update document status
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentExtract" SET "Status" = 'Extracting' WHERE id = $1`, documentId
    );

    // Call DeepSeek
    const truncated = doc.content.substring(0, 12000); // Limit context
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a control extraction expert. Return ONLY valid JSON arrays. No markdown." },
          { role: "user", content: EXTRACTION_PROMPT + truncated },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      await prisma.$executeRawUnsafe(
        `UPDATE "DocumentExtract" SET "Status" = 'Uploaded' WHERE id = $1`, documentId
      );
      return NextResponse.json({ error: `DeepSeek API error: ${response.status} — ${errText.substring(0, 200)}` }, { status: 500 });
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response (handle markdown code blocks)
    let jsonStr = aiText.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }

    let controls: any[] = [];
    try {
      controls = JSON.parse(jsonStr);
      if (!Array.isArray(controls)) controls = [];
    } catch {
      // Try to extract JSON array from text
      const match = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        try { controls = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    // Insert candidates
    let inserted = 0;
    for (const ctrl of controls) {
      if (!ctrl.name) continue;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ControlFromDocument" (
          id, "documentExtractId", name, statement, "controlType", "controlTypeDetail",
          "csfWho", "csfWhat", "csfWhen", "csfWhere", "csfWhy", "csfHow", "csfEvidence",
          "keyActivities", "riskAddressed", "keyRiskIndicator",
          "isHsseCritical", standard, "Requirements", "createdAt", "updatedAt", status
        ) VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18, NOW(), NOW(), 'Pending'
        )`,
        documentId,
        ctrl.name?.substring(0, 200) || "Untitled",
        ctrl.statement?.substring(0, 2000) || "",
        ctrl.controlType || null,
        ctrl.controlTypeDetail || null,
        ctrl.csfWho || null,
        ctrl.csfWhat || null,
        ctrl.csfWhen || null,
        ctrl.csfWhere || null,
        ctrl.csfWhy || null,
        ctrl.csfHow || null,
        ctrl.csfEvidence || null,
        ctrl.keyActivities || null,
        ctrl.riskAddressed || null,
        ctrl.keyRiskIndicator || null,
        ctrl.isHsseCritical === true,
        ctrl.standard || null,
        ctrl.requirements || null
      );
      inserted++;
    }

    // Update document status
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentExtract" SET "Status" = 'Extracted', "CompletedOn" = NOW() WHERE id = $1`, documentId
    );

    return NextResponse.json({
      success: true,
      documentId,
      candidatesExtracted: inserted,
      aiResponseLength: aiText.length,
    });
  } catch (err: any) {
    console.error("[extraction/extract] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
