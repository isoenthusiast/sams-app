import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-chat";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Keywords that trigger deep data loading
const DEEP_TRIGGERS: Record<string, string[]> = {
  controls: ["control statement", "control detail", "describe control", "tell me about control", "control description", "csf"],
  requirements: ["requirement detail", "clause content", "requirement description", "clause says", "intent", "applicability"],
  assessments: ["assessment detail", "audit detail", "who assessed", "assessment date"],
};

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
    };

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
         AND ("companyId" = $2 OR "companyId" = 'SAMS001')`,
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
3. You can request deep data reload by including ___FETCH___ controls, ___FETCH___ requirements, or ___FETCH___ assessments.
4. Suggest new controls when you identify gaps. Format:
___CONTROL___
{"name":"Name","statement":"Description","controlType":"Procedural|Administrative|Analytical|Behavioral|Informational|Engineering"}
___END_CONTROL___
5. Be concise and actionable.`;

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
    const re = /___CONTROL___\s*([\s\S]*?)\s*___END_CONTROL___/g;
    let m;
    while ((m = re.exec(replyText)) !== null) {
      try {
        const c = JSON.parse(m[1]);
        if (c.name && c.statement) controls.push(c);
      } catch { /* skip */ }
    }

    const cleanReply = replyText.replace(/___CONTROL___[\s\S]*?___END_CONTROL___/g, "").trim();

    return NextResponse.json({ reply: cleanReply || replyText, controls });
  } catch (error) {
    console.error("POST /api/chat/knowledge error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
