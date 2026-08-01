import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-v4-pro";

// POST /api/admin/assessments/[id]/ai-analysis
// Gathers all audit data and sends to DeepSeek for AI-powered analysis.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: assessmentId } = await params;

    // ── Gather audit context ──────────────────────────────────────
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        activityType: true,
        assessor: { select: { name: true } },
        checklistItems: { orderBy: { sortOrder: "asc" } },
        findings: {
          include: {
            actions: true,
            checklistItem: { select: { checklistItemId: true, checklistText: true } },
          },
        },
        controlAssignments: {
          include: {
            control: {
              include: {
                processArea: { select: { name: true } },
                requirementMappings: {
                  include: { requirement: { select: { requirementId: true, clauseContent: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    // ── Build the prompt context ──────────────────────────────────
    let context = "You are an expert Integrated Management System (IMS) auditor analyzing audit results. ";
    context += "You have deep knowledge of ISO 9001:2015, ISO 14001:2015, ISO 45001:2018, and ICOP PMS standards.\n\n";

    // Assessment overview
    context += "## ASSESSMENT OVERVIEW\n";
    context += `Name: ${assessment.name}\n`;
    context += `Type: ${assessment.activityType?.name ?? "N/A"}\n`;
    context += `LOA: ${assessment.loa}\n`;
    context += `Status: ${assessment.status}\n`;
    context += `Assessor: ${assessment.assessor?.name ?? "N/A"}\n`;
    if (assessment.objective) context += `Objective: ${assessment.objective}\n`;
    if (assessment.scope) context += `Scope: ${assessment.scope}\n`;
    if (assessment.methodology) context += `Methodology: ${assessment.methodology}\n`;
    if (assessment.keyFocus) context += `Key Focus: ${assessment.keyFocus}\n`;
    context += "\n";

    // Checklist compliance summary
    const checklistItems = assessment.checklistItems ?? [];
    context += "## CHECKLIST COMPLIANCE (" + checklistItems.length + " items)\n";
    const byStandard = new Map<string, { total: number; compliant: number; nonCompliant: number; observation: number; notTested: number }>();
    for (const item of checklistItems) {
      const key = item.auditStandard;
      if (!byStandard.has(key)) byStandard.set(key, { total: 0, compliant: 0, nonCompliant: 0, observation: 0, notTested: 0 });
      const s = byStandard.get(key)!;
      s.total++;
      if (item.complianceStatus === "Compliant") s.compliant++;
      else if (item.complianceStatus === "NonCompliant") s.nonCompliant++;
      else if (item.complianceStatus === "Observation") s.observation++;
      else s.notTested++;
    }
    for (const [std, s] of byStandard) {
      context += `${std}: ${s.total} total | ✓${s.compliant} Compliant | ✗${s.nonCompliant} NonCompliant | ⚠${s.observation} Observation | ?${s.notTested} NotTested\n`;
    }
    context += "\nNon-Compliant Items:\n";
    const ncItems = checklistItems.filter((i) => i.complianceStatus === "NonCompliant");
    if (ncItems.length === 0) {
      context += "  None\n";
    } else {
      for (const item of ncItems) {
        context += `  - [${item.checklistItemId}] ${item.checklistText}`;
        if (item.auditorNotes) context += ` (Notes: ${item.auditorNotes})`;
        context += "\n";
      }
    }
    context += "\n";

    // Findings
    context += "## FINDINGS (" + (assessment.findings?.length ?? 0) + ")\n";
    for (const f of assessment.findings ?? []) {
      context += `### ${f.id} [${f.severity}]${f.repeat ? " (REPEAT)" : ""}\n`;
      context += `Description: ${f.description}\n`;
      if (f.details) context += `Details: ${f.details}\n`;
      if (f.risks) context += `Risks: ${f.risks}\n`;
      if (f.checklistItem) context += `Linked Checklist: [${f.checklistItem.checklistItemId}] ${f.checklistItem.checklistText}\n`;
      if (f.actions?.length) {
        context += "Actions:\n";
        for (const a of f.actions) {
          context += `  - ${a.actionDescription}`;
          if (a.actionClosureEffective) context += " [CLOSED]";
          context += "\n";
        }
      }
      context += "\n";
    }

    // Control effectiveness
    const assignments = assessment.controlAssignments ?? [];
    const effective = assignments.filter((a) => a.effective === "Effective").length;
    const notEffective = assignments.filter((a) => a.effective === "NotEffective").length;
    context += `## CONTROL EFFECTIVENESS (${assignments.length} controls)\n`;
    context += `Effective: ${effective} | Not Effective: ${notEffective} | Not Assessed: ${assignments.length - effective - notEffective}\n\n`;

    // ── Prompt instruction ────────────────────────────────────────
    const instruction = `Analyze the audit data above and provide a structured report with the following sections:

1. **Executive Summary** (2-3 sentences): Overall audit outcome. Is the management system effective? What's the biggest concern?

2. **Pattern Analysis**: Identify recurring issues across standards. Are the same types of controls failing across ISO 9001, 14001, and 45001? Are there systemic gaps?

3. **Risk Assessment**: Which non-compliances pose the highest risk? Consider severity of findings, repeat findings, and control criticality.

4. **Recommendations** (3-5 actionable items): What should the organization do next? Be specific — reference checklist items, controls, or findings by ID.

5. **Standard-by-Standard Assessment**: For each standard (ISO 9001, ISO 14001, ISO 45001, PMS), give a 1-sentence health assessment.

Format your response in clean markdown. Be concise, evidence-based, and actionable. Do not invent data not present in the audit context.`;

    // ── Call DeepSeek ──────────────────────────────────────────────
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.includes("placeholder")) {
      return NextResponse.json({
        analysis: "DeepSeek API key is not configured. Set DEEPSEEK_API_KEY in .env.",
      });
    }

    const messages = [
      { role: "system" as const, content: context },
      { role: "user" as const, content: instruction },
    ];

    const dsResponse = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.5, max_tokens: 4096 }),
    });

    if (!dsResponse.ok) {
      const err = await dsResponse.text();
      console.error("DeepSeek API error:", dsResponse.status, err.substring(0, 200));
      return NextResponse.json({ error: `AI service error (${dsResponse.status})` }, { status: 502 });
    }

    const dsData = await dsResponse.json();
    const analysis = dsData.choices?.[0]?.message?.content || "No analysis generated.";

    // ── Log the analysis in ActivityLog ────────────────────────────
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ActivityLog" (id, "userId", "userName", action, "entityType", "entityId", summary, metadata, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        `log_ai_${Date.now()}`,
        (session.user as any).id || "unknown",
        (session.user as any).name || "unknown",
        "AI_ANALYSIS",
        "Assessment",
        assessmentId,
        `AI analysis generated for ${assessment.name}`,
        JSON.stringify({ model: MODEL, itemsAnalyzed: checklistItems.length, findingsAnalyzed: assessment.findings?.length ?? 0 }),
      );
    } catch { /* logging optional */ }

    return NextResponse.json({ analysis, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("AI analysis error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
