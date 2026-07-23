import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-chat";

// ── GET — list documents or fetch candidates for a specific document ──
export async function GET(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const companyId = await getSelectedCompanyId();
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get("docId");

    // If docId provided, return candidates for that document
    if (docId) {
      const doc = await prisma.documentExtract.findUnique({
        where: { id: docId },
        include: {
          controlFromDocuments: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      // Fetch available Process Areas for the mapping dropdown
      const processAreas = await prisma.processArea.findMany({
        where: companyId ? { companyId } : {},
        select: { id: true, name: true, pId: true, standard: true },
        orderBy: { name: "asc" },
      });

      return NextResponse.json({
        document: {
          id: doc.id,
          docNo: doc.docNo,
          documentTitle: doc.documentTitle,
          documentType: doc.documentType,
          status: doc.status,
          content: doc.content?.substring(0, 5000),
        },
        candidates: doc.controlFromDocuments,
        processAreas,
      });
    }

    const docs = await prisma.documentExtract.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: "desc" },
      include: {
        controlFromDocuments: {
          select: { id: true, status: true },
        },
      },
    });

    const items = docs.map((d) => ({
      id: d.id,
      docNo: d.docNo,
      documentTitle: d.documentTitle,
      documentType: d.documentType,
      status: d.status,
      createdAt: d.createdAt,
      totalCandidates: d.controlFromDocuments.length,
      pendingCandidates: d.controlFromDocuments.filter((c) => c.status === "Pending").length,
      approvedCandidates: d.controlFromDocuments.filter((c) => c.status === "Approved").length,
      rejectedCandidates: d.controlFromDocuments.filter((c) => c.status === "Rejected").length,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/admin/extraction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST — upload document, extract text, run AI extraction ─────────
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const companyId = await getSelectedCompanyId();

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const processAreaId = (formData.get("processAreaId") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const allowedExts = [".pdf", ".md", ".csv", ".txt", ".docx"];
    const ext = fileName.substring(fileName.lastIndexOf("."));
    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}. Allowed: ${allowedExts.join(", ")}` },
        { status: 400 }
      );
    }

    // Save file temporarily for text extraction
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = join(process.cwd(), "uploads");
    const tempPath = join(tempDir, `${randomUUID()}${ext}`);

    try {
      await writeFile(tempPath, buffer);
    } catch {
      // Create directory if needed and retry
      const { mkdir } = await import("fs/promises");
      await mkdir(tempDir, { recursive: true });
      await writeFile(tempPath, buffer);
    }

    // Extract text from file
    let extractedText = "";
    try {
      if (ext === ".pdf") {
        const { PDFParse } = await import("pdf-parse");
        const pdfBuffer = await readFile(tempPath);
        const pdfParser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
        const textResult = await pdfParser.getText();
        extractedText = textResult.text;
        await pdfParser.destroy();
      } else if (ext === ".docx") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ path: tempPath });
        extractedText = result.value;
      } else if (ext === ".csv") {
        const csvText = await readFile(tempPath, "utf-8");
        // Convert CSV to markdown table
        const lines = csvText.trim().split("\n");
        if (lines.length > 0) {
          const headers = lines[0].split(",").map((h) => h.trim());
          extractedText = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
          for (let i = 1; i < Math.min(lines.length, 500); i++) {
            const cells = lines[i].split(",").map((c) => c.trim());
            extractedText += `| ${cells.join(" | ")} |\n`;
          }
        }
      } else {
        // .md or .txt — direct read
        extractedText = await readFile(tempPath, "utf-8");
      }
    } finally {
      // Clean up temp file
      try { await unlink(tempPath); } catch { /* ignore */ }
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from the document. The file may be empty or image-based." },
        { status: 422 }
      );
    }

    // Truncate very long documents to avoid token limits
    const maxChars = 30000;
    const truncatedText = extractedText.length > maxChars
      ? extractedText.substring(0, maxChars) + "\n\n... (document truncated for extraction)"
      : extractedText;

    // Get the next docNo
    const maxDoc = await prisma.documentExtract.findFirst({
      orderBy: { docNo: "desc" },
      select: { docNo: true },
    });
    const nextDocNo = (maxDoc?.docNo || 0) + 1;

    // Create DocumentExtract record
    const doc = await prisma.documentExtract.create({
      data: {
        docNo: nextDocNo,
        documentTitle: file.name.replace(ext, ""),
        documentType: ext.replace(".", "").toUpperCase(),
        content: extractedText,
        status: "Extracting",
        companyId,
      },
    });

    // Build AI prompt with process area context
    let paContext = "";
    let requirementsContext = "";

    if (processAreaId) {
      const pa = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "name", "description", "pId", "standard" FROM "ProcessArea" WHERE "id" = $1 LIMIT 1`,
        processAreaId
      );
      if (pa?.[0]) {
        paContext = `\nProcess Area: ${pa[0].name}\nDescription: ${pa[0].description || ""}\nStandard: ${pa[0].standard || ""}`;
      }

      // Fetch requirements for this PA to help matching
      const reqs = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "rID", "requirementId", "standard", "requirements" FROM "Requirement" WHERE "processAreaId" = $1 AND "companyId" = $2 LIMIT 50`,
        processAreaId, companyId || "SAMS001"
      );
      if (reqs?.length) {
        requirementsContext = "\nAvailable Requirements in this Process Area:\n" +
          reqs.map((r) => `- [${r.requirementId}] ${r.standard}: ${(r.requirements || "").substring(0, 200)}`).join("\n");
      }
    }

    const systemPrompt = `You are an AI control extraction engine for an assurance management system.
Your task: extract structured controls from the provided document content.

${paContext}
${requirementsContext}

For each control you find in the document, output it in this exact format:

___CONTROL___
{
  "name": "Short descriptive control name (max 100 chars)",
  "statement": "Detailed control statement — what must be done, by whom, when, and how (max 500 chars)",
  "controlType": "Procedural|Administrative|Analytical|Behavioral|Informational|Engineering",
  "controlTypeDetail": "Optional subtype detail",
  "csfWho": "Who performs this control (role title)",
  "csfWhat": "What action is performed",
  "csfWhen": "Frequency: Daily|Weekly|Monthly|Quarterly|Annually|As Needed|Continuous|Per Shift|Before Each Use|After Each Use|Bi-Weekly|Bi-Monthly|Semi-Annually|As Required",
  "csfWhere": "Where it's performed (system, location, equipment)",
  "csfWhy": "Why this control exists (objective, risk addressed)",
  "csfHow": "How the control is performed (method, steps — keep under 800 chars)",
  "csfEvidence": "Evidence generated (records, logs, reports, checklists)",
  "isHsseCritical": true or false,
  "riskWeight": 1 (Low), 2 (Medium), or 3 (High),
  "standard": "Applicable standard (e.g., ISO 14001, ISO 45001, SEAM Practice)",
  "pId": "Process Area pID if known",
  "Requirements": "Matching requirement ID from the available list, or 'Unmapped Controls'",
  "keyActivities": "Key activities for this control",
  "riskAddressed": "Risk addressed by this control",
  "keyRiskIndicator": "Key risk indicator for this control"
}
___END_CONTROL___

Guidelines:
- Extract ALL distinct controls from the document. A 20-page document may have 5-20 controls.
- ONE control = ONE complete ___CONTROL___ block. Do NOT combine multiple controls.
- If the document has numbered sections, each section may be a control.
- Look for shall/must statements, procedure steps, responsibilities, and requirements.
- If you cannot determine a field, use null (not "N/A").
- The "Requirements" field should match an existing requirement ID from the available list when possible, otherwise use "Unmapped Controls".
- Be thorough — it's better to extract more candidates for human review than to miss controls.`;

    // Call DeepSeek
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.includes("placeholder")) {
      // Update doc status to indicate failure
      await prisma.documentExtract.update({
        where: { id: doc.id },
        data: { status: "Uploaded" },
      });
      return NextResponse.json(
        { error: "DeepSeek API key is not configured." },
        { status: 500 }
      );
    }

    const dsResponse = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract all controls from this document:\n\n${truncatedText}` },
        ],
        temperature: 0.3,
        max_tokens: 8192,
      }),
    });

    if (!dsResponse.ok) {
      const errText = await dsResponse.text();
      console.error("DeepSeek API error:", dsResponse.status, errText);
      await prisma.documentExtract.update({
        where: { id: doc.id },
        data: { status: "Uploaded" },
      });
      return NextResponse.json(
        { error: `AI extraction failed (${dsResponse.status}). Please try again.` },
        { status: 502 }
      );
    }

    const dsData = await dsResponse.json();
    const replyText = dsData.choices?.[0]?.message?.content || "";

    // Parse control candidates from reply
    const controlRegex = /___CONTROL___\s*([\s\S]*?)\s*___END_CONTROL___/g;
    const candidates: any[] = [];
    let match;

    while ((match = controlRegex.exec(replyText)) !== null) {
      try {
        const ctrl = JSON.parse(match[1]);
        if (ctrl.name && ctrl.statement) {
          candidates.push({
            name: ctrl.name.substring(0, 100),
            statement: ctrl.statement,
            controlType: ctrl.controlType || "Procedural",
            controlTypeDetail: ctrl.controlTypeDetail || null,
            processAreaId: processAreaId || null,
            isHsseCritical: ctrl.isHsseCritical === true,
            riskWeight: [1, 2, 3].includes(ctrl.riskWeight) ? ctrl.riskWeight : 1,
            csfWho: ctrl.csfWho || null,
            csfWhat: ctrl.csfWhat || null,
            csfWhen: ctrl.csfWhen || null,
            csfWhere: ctrl.csfWhere || null,
            csfWhy: ctrl.csfWhy || null,
            csfHow: ctrl.csfHow ? ctrl.csfHow.substring(0, 800) : null,
            csfEvidence: ctrl.csfEvidence || null,
            standard: ctrl.standard || null,
            pId: ctrl.pId || null,
            Requirements: ctrl.Requirements || "Unmapped Controls",
            keyActivities: ctrl.keyActivities || null,
            riskAddressed: ctrl.riskAddressed || null,
            keyRiskIndicator: ctrl.keyRiskIndicator || null,
            documentExtractId: doc.id,
            status: "Pending",
          });
        }
      } catch {
        // Skip malformed control blocks
      }
    }

    // If no candidates found with regex, try treating whole response as controls
    if (candidates.length === 0) {
      // Return the raw reply for debugging
      await prisma.documentExtract.update({
        where: { id: doc.id },
        data: { status: "Uploaded" },
      });
      return NextResponse.json({
        error: "No controls could be extracted. The AI response did not contain valid control blocks.",
        rawReply: replyText.substring(0, 2000),
      }, { status: 422 });
    }

    // Bulk insert candidates
    await prisma.controlFromDocument.createMany({
      data: candidates,
    });

    // Update doc status
    await prisma.documentExtract.update({
      where: { id: doc.id },
      data: { status: "Extracted" },
    });

    return NextResponse.json({
      document: { id: doc.id, title: doc.documentTitle, docNo: doc.docNo },
      candidatesFound: candidates.length,
      candidates: candidates.map((c) => ({
        name: c.name,
        statement: c.statement.substring(0, 200),
        controlType: c.controlType,
      })),
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/extraction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH — review candidate (approve/reject) and promote to Control ──
export async function PATCH(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;
    const companyId = await getSelectedCompanyId();

    const body = await request.json();
    const { id, action, edits } = body;
    // action: "approve" | "reject"
    // edits: optional field overrides before approving

    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const candidate = await prisma.controlFromDocument.findUnique({
      where: { id },
      include: { documentExtract: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (candidate.status !== "Pending") {
      return NextResponse.json(
        { error: `Candidate is already ${candidate.status}` },
        { status: 409 }
      );
    }

    if (action === "reject") {
      await prisma.controlFromDocument.update({
        where: { id },
        data: { status: "Rejected" },
      });
      return NextResponse.json({ status: "Rejected" });
    }

    // Approve: create a Control record and MapControl2Requirement
    const mergedEdits = { ...candidate, ...(edits || {}) };

    // Ensure processAreaId exists
    if (!mergedEdits.processAreaId) {
      return NextResponse.json(
        { error: "processAreaId is required to approve. Please assign a Process Area." },
        { status: 400 }
      );
    }

    // Create the Control
    const control = await prisma.control.create({
      data: {
        name: mergedEdits.name,
        statement: mergedEdits.statement,
        controlType: mergedEdits.controlType as any,
        processAreaId: mergedEdits.processAreaId,
        isHsseCritical: mergedEdits.isHsseCritical || false,
        ramRating: mergedEdits.ramRating || null,
        riskWeight: mergedEdits.riskWeight || 1,
        companyId: companyId || "SAMS001",
      },
    });

    // Find or create the "Unmapped Controls" requirement for this PA
    const reqId = mergedEdits.Requirements || "Unmapped Controls";
    const standard = mergedEdits.standard || "SEAM Practice";

    let requirement = await prisma.requirement.findFirst({
      where: {
        requirementId: reqId,
        standard: standard,
        companyId: companyId || "SAMS001",
        processAreaId: mergedEdits.processAreaId,
      },
    });

    if (!requirement && reqId === "Unmapped Controls") {
      // Create the catch-all requirement
      const maxRId = await prisma.requirement.findFirst({
        orderBy: { rId: "desc" },
        select: { rId: true },
      });
      requirement = await prisma.requirement.create({
        data: {
          rId: (maxRId?.rId || 2200) + 1,
          requirementId: "Unmapped Controls",
          standard: standard,
          pId: mergedEdits.pId || "UC",
          clauseContent: `Catch-all for controls from ${candidate.documentExtract.documentTitle}`,
          intentOutcome: "",
          clauseApplicability: "",
          processAreaId: mergedEdits.processAreaId,
          companyId: companyId || "SAMS001",
        },
      });
    }

    if (requirement) {
      // Create MapControl2Requirement
      await prisma.mapControl2Requirement.create({
        data: {
          controlId: control.id,
          requirementRId: requirement.rId,
          processAreaId: mergedEdits.processAreaId,
        },
      });
    }

    // Update candidate
    await prisma.controlFromDocument.update({
      where: { id },
      data: {
        status: "Approved",
        approvedControlId: control.id,
      },
    });

    // Check if all candidates for this document are resolved
    const docId = candidate.documentExtractId;
    const pendingCount = await prisma.controlFromDocument.count({
      where: { documentExtractId: docId, status: "Pending" },
    });
    if (pendingCount === 0) {
      await prisma.documentExtract.update({
        where: { id: docId },
        data: { status: "Completed" },
      });
    }

    return NextResponse.json({
      status: "Approved",
      controlId: control.id,
      requirementId: requirement?.requirementId || null,
    });
  } catch (error) {
    console.error("PATCH /api/admin/extraction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
