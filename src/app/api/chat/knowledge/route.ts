import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-chat";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { message, processAreaId, companyId, history } = body as {
      message: string;
      processAreaId: string;
      companyId: string;
      history?: ChatMessage[];
    };

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Fetch process area info
    const pa = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "name", "description", "pId", "standard" FROM "ProcessArea" WHERE "id" = $1 LIMIT 1`,
      processAreaId
    );
    const paName = pa?.[0]?.name || "Unknown Process Area";
    const paDesc = pa?.[0]?.description || "";

    // Fetch Knowledgebase entries for this process area AND for SAMS001 (global knowledge)
    const kbEntries = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "knowledgeName", "knowledgeContent", "remarks", "companyId"
       FROM "Knowledgebase"
       WHERE ("processAreaId" = $1 OR "processAreaId" IS NULL)
         AND ("companyId" = $2 OR "companyId" = 'SAMS001')
       ORDER BY "createdDate" DESC
       LIMIT 30`,
      processAreaId, companyId || "SAMS001"
    );

    // Build knowledge context
    let kbContext = "";
    for (const entry of kbEntries || []) {
      const coLabel = entry.companyId === "SAMS001" ? "[SAMS - Global]" : `[${entry.companyId}]`;
      kbContext += `\n### ${coLabel} ${entry.knowledgeName}\n`;
      if (entry.remarks) kbContext += `> Remarks: ${entry.remarks}\n`;
      const content = entry.knowledgeContent || "";
      kbContext += content.length > 8000
        ? content.slice(0, 8000) + "\n... (truncated)"
        : content;
      kbContext += "\n---\n";
    }

    // System prompt
    const systemPrompt = `You are an AI assistant for the CONAN PROJECT assurance management system.
You are helping a user understand and manage controls for the process area "${paName}".

${paDesc ? `Process Area Description: ${paDesc}` : ""}

You have access to the following Knowledgebase documents relevant to this process area:
${kbContext || "(No knowledgebase documents found for this process area.)"}

Your capabilities:
1. Answer questions about the process area, its controls, requirements, and the knowledgebase content.
2. Suggest new controls that should be added based on gaps you identify in the knowledgebase.
3. When you identify a control that should be added, output it in this exact format:

___CONTROL___
{
  "name": "Control Name (short, descriptive)",
  "statement": "Detailed control statement describing what should be done",
  "controlType": "Procedural|Administrative|Analytical|Behavioral|Informational|Engineering"
}
___END_CONTROL___

4. You can suggest multiple controls. Each one must be wrapped in ___CONTROL___ ... ___END_CONTROL___ markers.
5. Be concise and professional. Focus on actionable insights.
6. If the user asks about something not in the knowledgebase, be honest about what you don't know.`;

    // Build messages array
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-20),
      { role: "user", content: message },
    ];

    // Call DeepSeek API
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.includes("placeholder")) {
      return NextResponse.json({
        reply: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY in your .env file.",
        controls: [],
      });
    }

    const dsResponse = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!dsResponse.ok) {
      const err = await dsResponse.text();
      console.error("DeepSeek API error:", err);
      return NextResponse.json({
        reply: `DeepSeek API error (${dsResponse.status}). Please try again later.`,
        controls: [],
      });
    }

    const dsData = await dsResponse.json();
    const replyText = dsData.choices?.[0]?.message?.content || "No response from DeepSeek.";

    // Parse control suggestions from reply
    const controls: Array<{ name: string; statement: string; controlType: string }> = [];
    const controlRegex = /___CONTROL___\s*([\s\S]*?)\s*___END_CONTROL___/g;
    let match;
    while ((match = controlRegex.exec(replyText)) !== null) {
      try {
        const ctrl = JSON.parse(match[1]);
        if (ctrl.name && ctrl.statement) {
          controls.push({
            name: ctrl.name,
            statement: ctrl.statement,
            controlType: ctrl.controlType || "Procedural",
          });
        }
      } catch (_e) {
        // Skip malformed control blocks
      }
    }

    // Clean reply: remove control blocks from display text
    const cleanReply = replyText.replace(controlRegex, "").trim();

    return NextResponse.json({
      reply: cleanReply,
      controls,
      rawReply: replyText,
    });
  } catch (error: any) {
    console.error("Chat knowledge error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
