import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-v4-pro";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Keywords that trigger deep data loading
const DEEP_TRIGGERS: Record<string, string[]> = {
  controls: ["control statement", "control detail", "describe control", "tell me about control", "control description", "csf"],
  requirements: ["requirement detail", "clause content", "requirement description", "clause says", "intent", "applicability"],
  assessments: ["assessment detail", "audit detail", "who assessed", "assessment date"],
  documents: ["document detail", "document content", "show document", "full document", "read document", "open document"],
};

// Detect document name mentions for on-demand loading
function detectDocNames(msg: string): string[] {
  const patterns = [
    /(?:read|show|open|get|fetch)\s+(?:the\s+)?(?:document|file)\s+["']?([^"'\n]+)["']?/i,
    /(["'][^"']+["'])\s*(?:document|file|pdf|doc|md|csv)/i,
  ];
  const names: string[] = [];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m?.[1]) names.push(m[1].replace(/["']/g, "").trim());
  }
  return names;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { message, processAreaId, companyId, history } = body as {
      message: string; processAreaId: string; companyId: string; history?: ChatMessage[];
    };

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const msgLower = message.toLowerCase();

    // Detect ___FETCH___ marker from AI requests
    const fetchMatch = msgLower.match(/___fetch___\s*(\w+)/);
    const requestedFetch = fetchMatch ? fetchMatch[1] : null;

    // Determine deep load based on keywords
    const deepLoad = {
      controls: requestedFetch === "controls" || DEEP_TRIGGERS.controls.some(k => msgLower.includes(k)),
      requirements: requestedFetch === "requirements" || DEEP_TRIGGERS.requirements.some(k => msgLower.includes(k)),
      assessments: requestedFetch === "assessments" || DEEP_TRIGGERS.assessments.some(k => msgLower.includes(k)),
      documents: requestedFetch === "documents" || DEEP_TRIGGERS.documents.some(k => msgLower.includes(k)),
    };
    const requestedDocNames = detectDocNames(msgLower);

    // Resolve the SAMS001 master company id (companyId columns store Company.id cuid)
    const masterRow = await prisma.company.findUnique({ where: { companyID: "SAMS001" }, select: { id: true } });
    const masterId = masterRow?.id ?? "SAMS001";
    const effectiveCompanyId = companyId || masterId;

    // ── LIGHTWEIGHT: Always fetch summary data ───────────────────────
    const pa = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "name", "description", "pId", "standard" FROM "ProcessArea" WHERE "id" = $1 LIMIT 1`,
      processAreaId
    );
    const paName = pa?.[0]?.name || "Unknown Process Area";
    const paDesc = pa?.[0]?.description || "";

    const controlNames = await prisma.$queryRawUnsafe<any[]>(
      `SELECT name, "controlType", "ramRating", "rawHealthScore"
       FROM "Control" WHERE "processAreaId" = $1 ORDER BY name LIMIT 50`,
      processAreaId
    );

    const reqHeaders = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "requirementId" FROM "Requirement"
       WHERE "processAreaId" = $1 ORDER BY "requirementId" LIMIT 30`,
      processAreaId
    );

    const [apCount, kbCount] = await Promise.all([
      prisma.assuranceProtocol.count({ where: { processAreaName: paName } }),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::int as count FROM "Knowledgebase"
         WHERE ("processAreaId" = $1 OR "processAreaId" IS NULL)
         AND ("companyId" = $2 OR "companyId" = 'SAMS001')
         AND "entryType" = 'Knowledge'`,
        processAreaId, companyId || "SAMS001"
      ).then(r => Number(r[0]?.count ?? 0)),
    ]);

    // ── BUILD: Lightweight context ───────────────────────────────────
    let context = `You are an AI assistant for the CONAN PROJECT assurance management system.
Process Area: "${paName}"${paDesc ? ` — ${paDesc}` : ""}

## Live Summary
- **Controls** (${controlNames.length}): ${controlNames.map(c => `${c.name} [${c.controlType}, RAM:${c.ramRating||"?"}, Health:${c.rawHealthScore??"?"}%]`).join("; ")}
- **Requirements** (${reqHeaders.length}): ${reqHeaders.map(r => r.requirementId).join(", ")}
- **Knowledgebase**: ${kbCount} document(s) | **Protocols**: ${apCount}
`;

    // ── PA Documents (always include summaries) ──────────────────────
    const paDocs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, filename, summary, "createdAt"
       FROM "Document"
       WHERE "processAreaId" = $1 AND "archivedAt" IS NULL
         AND ("companyId" = $2 OR "companyId" = $3)
       ORDER BY "createdAt" DESC LIMIT 30`,
      processAreaId, effectiveCompanyId, masterId
    );

    if (paDocs.length > 0) {
      context += `\n## PA Documents (${paDocs.length})\n`;
      for (const d of paDocs) {
        context += `- **${d.filename}** — ${d.summary || "No summary"}\n`;
      }
      context += `\nTo read a document's full content, the AI can request: ___FETCH___ documents`;
    }

    // ── ON-DEMAND: Document full content ─────────────────────────────
    if (deepLoad.documents || requestedDocNames.length > 0) {
      const docsToFetch = requestedDocNames.length > 0
        ? await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, filename, "documentContent", summary
             FROM "Document"
             WHERE "processAreaId" = $1 AND "archivedAt" IS NULL
               AND ("companyId" = $2 OR "companyId" = $3)
             AND filename ILIKE ANY(ARRAY[${requestedDocNames.map((_, i) => `$${i + 4}`).join(", ")}])
             LIMIT 10`,
            processAreaId, effectiveCompanyId, masterId, ...requestedDocNames.map(n => `%${n}%`)
          )
        : await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, filename, "documentContent", summary
             FROM "Document"
             WHERE "processAreaId" = $1 AND "archivedAt" IS NULL
               AND ("companyId" = $2 OR "companyId" = $3)
             ORDER BY "createdAt" DESC LIMIT 5`,
            processAreaId, effectiveCompanyId, masterId
          );

      if (docsToFetch.length > 0) {
        context += `\n## Document Full Content\n`;
        for (const d of docsToFetch) {
          const c = (d.documentContent || "").substring(0, 4000);
          context += `### ${d.filename}\n${c}\n---\n`;
        }
      }
    }

    // ── ON-DEMAND: Deep control data ─────────────────────────────────
    if (deepLoad.controls) {
      const controls = await prisma.$queryRawUnsafe<any[]>(
        `SELECT name, statement, "controlType", "ramRating", "rawHealthScore",
                "csfWho", "csfWhat", "csfWhen", "csfWhere", "csfWhy", "csfHow"
         FROM "Control" WHERE "processAreaId" = $1 ORDER BY name LIMIT 50`,
        processAreaId
      );
      context += `\n## Control Details\n`;
      for (const c of controls) {
        context += `### ${c.name} [${c.controlType}, RAM:${c.ramRating||"N/A"}, Health:${c.rawHealthScore??"N/A"}%]\n`;
        if (c.statement) context += `Statement: ${c.statement.substring(0, 300)}\n`;
        if (c.csfWho) context += `Who: ${c.csfWho}\n`;
        if (c.csfWhat) context += `What: ${c.csfWhat}\n`;
        if (c.csfWhen) context += `When: ${c.csfWhen}\n`;
        if (c.csfWhy) context += `Why: ${c.csfWhy}\n`;
        if (c.csfHow) context += `How: ${c.csfHow}\n`;
        context += "\n";
      }
    }

    // ── ON-DEMAND: Deep requirement data ─────────────────────────────
    if (deepLoad.requirements) {
      const reqs = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "requirementId", "clauseContent", "intentOutcome", "clauseApplicability"
         FROM "Requirement" WHERE "processAreaId" = $1 ORDER BY "requirementId" LIMIT 30`,
        processAreaId
      );
      context += `\n## Requirement Details\n`;
      for (const r of reqs) {
        context += `### ${r.requirementId}\n`;
        if (r.clauseContent) context += `Content: ${r.clauseContent}\n`;
        if (r.intentOutcome) context += `Intent: ${r.intentOutcome}\n`;
        if (r.clauseApplicability) context += `Applicability: ${r.clauseApplicability}\n`;
        context += "\n";
      }
    }

    // ── ON-DEMAND: Assessment data ───────────────────────────────────
    if (deepLoad.assessments) {
      const assessments = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a.name, a.status, a."startDate", a."endDate", u.name as assessor
         FROM "Assessment" a
         JOIN "ControlAssignment" ca ON ca."assessmentId" = a.id
         JOIN "Control" c ON c.id = ca."controlId"
         LEFT JOIN "User" u ON u.id = a."assessorId"
         WHERE c."processAreaId" = $1
         ORDER BY a."startDate" DESC LIMIT 20`,
        processAreaId
      );
      context += `\n## Assessment Details\n`;
      for (const a of assessments) {
        context += `- ${a.name} [${a.status}] — ${a.assessor||"?"} — ${a.startDate ? new Date(a.startDate).toLocaleDateString() : "N/A"}\n`;
      }
    }

    // ── KB context (truncated, always included) ──────────────────────
    const kbEntries = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "knowledgeName", "knowledgeContent", "remarks"
       FROM "Knowledgebase"
       WHERE ("processAreaId" = $1 OR "processAreaId" IS NULL)
       AND ("companyId" = $2 OR "companyId" = 'SAMS001')
       AND "entryType" = 'Knowledge'
       ORDER BY "createdDate" DESC LIMIT 10`,
      processAreaId, companyId || "SAMS001"
    );

    if (kbEntries.length > 0) {
      context += `\n## Knowledgebase\n`;
      for (const e of kbEntries) {
        context += `### ${e.knowledgeName}\n`;
        if (e.remarks) context += `> ${e.remarks}\n`;
        const c = e.knowledgeContent || "";
        context += (c.length > 3000 ? c.slice(0, 3000) + "\n...(truncated)" : c) + "\n---\n";
      }
    }

    // ── Instructions ─────────────────────────────────────────────────
    context += `
## Instructions
1. Answer using live data above. Reference control names, health scores, and RAM ratings.
2. If user needs deeper details not shown, tell them to ask specifically (e.g., "show me control statements").
3. You can request deep data reload by including ___FETCH___ controls, ___FETCH___ requirements, ___FETCH___ assessments, or ___FETCH___ documents.
4. PA Documents listed above are uploaded files for this process area. Use ___FETCH___ documents to load their full content. Reference them by filename.
5. Suggest new controls when you identify gaps. Format:
___CONTROL___
{"name":"Name","statement":"Description","controlType":"Procedural|Administrative|Analytical|Behavioral|Informational|Engineering"}
___END_CONTROL___
5. Suggest new controls when you identify gaps. Format:
___CONTROL___
{"name":"Name","statement":"Description","controlType":"Procedural|Administrative|Analytical|Behavioral|Informational|Engineering"}
___END_CONTROL___
6. **Process Improvement Proposals:** When you identify a gap, risk, or improvement opportunity, propose a PIP (Process Improvement Plan) item. These appear as actionable cards the user can add to their Kanban board. Format:
___PIP___
{"title":"Short improvement title (max 100 chars)","description":"What needs improving and why — be specific about the gap or risk","priority":"High|Medium|Low"}
___END_PIP___
Use this when: a control has low health, a finding needs action, an assessment gap exists, or the user asks "what should we improve?"
7. Be concise and actionable.`;

    // ── Call DeepSeek ────────────────────────────────────────────────
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.includes("placeholder")) {
      return NextResponse.json({
        reply: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY in your .env file.",
        controls: [],
      });
    }

    const messages: ChatMessage[] = [
      { role: "system", content: context },
      ...(history || []).slice(-20),
      { role: "user", content: message },
    ];

    const dsResponse = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 4096 }),
    });

    if (!dsResponse.ok) {
      const err = await dsResponse.text();
      console.error("DeepSeek API error:", err);
      return NextResponse.json({ reply: `DeepSeek API error (${dsResponse.status}).`, controls: [] });
    }

    const dsData = await dsResponse.json();
    const replyText = dsData.choices?.[0]?.message?.content || "No response.";

    // Parse control suggestions
    const controls: Array<{ name: string; statement: string; controlType: string }> = [];
    const cre = /___CONTROL___\s*([\s\S]*?)\s*___END_CONTROL___/g;
    let cm;
    while ((cm = cre.exec(replyText)) !== null) {
      try {
        const c = JSON.parse(cm[1]);
        if (c.name && c.statement) controls.push(c);
      } catch { /* skip */ }
    }

    // Parse PIP proposals
    const proposedPips: Array<{ title: string; description: string; priority: string }> = [];
    const pre = /___PIP___\s*([\s\S]*?)\s*___END_PIP___/g;
    let pm;
    while ((pm = pre.exec(replyText)) !== null) {
      try {
        const p = JSON.parse(pm[1]);
        if (p.title) proposedPips.push({ title: p.title, description: p.description || "", priority: p.priority || "Medium" });
      } catch { /* skip */ }
    }

    const cleanReply = replyText.replace(/___CONTROL___[\s\S]*?___END_CONTROL___/g, "").replace(/___PIP___[\s\S]*?___END_PIP___/g, "").trim();

    return NextResponse.json({ reply: cleanReply || replyText, controls, proposedPips });
  } catch (error) {
    console.error("POST /api/chat/knowledge error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
