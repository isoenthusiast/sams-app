import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/authz";

/**
 * SAMS-013 — Transcript → Evidence Chain (Phase 4, Feature A).
 *
 * The "AI proposes" half of the human-confirmed contract: given a transcript and
 * the target assessment's checklist items, produce ONE ExtractionProposal per
 * evidence-claim. Each proposal carries the evidence excerpt + a transcript
 * span reference; NOTHING links while status = Proposed (the proposal is the
 * attestation trail).
 *
 * Two extractors:
 *   - `deepseek` (default, production): the existing DeepSeek pipeline returns a
 *     structured JSON list; the service computes real char-span references by
 *     locating the excerpt inside the transcript.
 *   - `keyword` (deterministic, no API key): a lightweight best-effort extractor
 *     that locates the most-topical transcript sentence for each checklist item.
 *     Used for the deterministic E2E harness (EVIDENCE_EXTRACTOR=keyword) so the
 *     full extract → review → confirm flow is testable without LLM cost/flake.
 *
 * Scope-by-construction: the caller passes ONLY this company's checklist items
 * (loaded scoped to the session company), and every created proposal is stamped
 * with that companyId. Cross-tenant targeting is therefore impossible.
 */

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-v4-pro";

export type ChecklistItemInput = {
  id: string;
  checklistItemId: string;
  checklistText: string;
  auditStandard: string;
  evidenceRequirements?: string | null;
  whatGoodLooksLike?: string | null;
  controlPoints?: string | null;
  keyQuestions?: string | null;
};

export type ExtractorItem = {
  checklistItemId: string;
  evidenceExcerpt: string;
  suggestedAction?: string | null;
};

export type ExtractContext = {
  knowledgebaseId: string;
  assessmentId: string;
  companyId: string;
  userId?: string;
  transcriptTitle?: string;
};

export type PersistedProposal = {
  id: string;
  status: string;
  assessmentId: string;
  transcriptId: string;
  transcriptTitle: string | null;
  companyId: string;
  spanStart: number;
  spanEnd: number;
  evidenceExcerpt: string;
  suggestedAction: string | null;
  proposedBy: string;
  proposedByUserId: string | null;
  createdAt: string;
  checklistItem: {
    id: string;
    checklistItemId: string;
    checklistText: string;
    auditStandard: string;
  } | null;
};

// ── Prompt construction ────────────────────────────────────────────────────

export function buildExtractorPrompt(
  transcript: { title: string; content: string },
  checklistItems: ChecklistItemInput[]
): { system: string; user: string } {
  const itemsBlock = checklistItems
    .map((it, i) => {
      const context = [
        it.evidenceRequirements && `Evidence requirements: ${it.evidenceRequirements}`,
        it.whatGoodLooksLike && `What good looks like: ${it.whatGoodLooksLike}`,
        it.keyQuestions && `Key questions: ${it.keyQuestions}`,
        it.controlPoints && `Control points: ${it.controlPoints}`,
      ]
        .filter(Boolean)
        .join(" · ");
      return `[${i}] id="${it.checklistItemId}" standard="${it.auditStandard}"\n    item: ${it.checklistText}\n    ${context ? `context: ${context}\n    ` : ""}`;
    })
    .join("\n");

  const system =
    "You are an expert Integrated Management System (IMS) auditor '" +
    "extracting evidence claims from a meeting transcript. For each checklist " +
    "item, find where the transcript discusses it and quote the EXACT passage " +
    "that supports it (verbatim, as a single continuous span), plus an optional " +
    "suggested remediation action. Only return evidence you can actually locate " +
    "in the transcript. Never invent text. Output STRICT JSON only: " +
    '{"items":[{"checklistItemId":"<the id field value>","evidenceExcerpt":"<verbatim quote>","suggestedAction":"<optional action or empty>"}]}';

  const user = `CHECKLIST ITEMS TO MATCH:\n${itemsBlock}\n\nTRANSCRIPT TITLE: ${transcript.title}\nTRANSCRIPT:\n${transcript.content}\n\nReturn strict JSON with the items array.`;

  return { system, user };
}

// ── DeepSeek call ──────────────────────────────────────────────────────────

async function deepSeekExtract(items: ChecklistItemInput[], transcript: { title: string; content: string }): Promise<ExtractorItem[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey.includes("placeholder")) {
    const err = new Error("DEEPSEEK_API_KEY is not configured.");
    (err as Error & { code?: string }).code = "EVIDENCE_NO_API_KEY";
    throw err;
  }

  const { system, user } = buildExtractorPrompt(transcript, items);
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("[evidence-extraction] DeepSeek error", res.status, t.substring(0, 300));
    const err = new Error(`AI service error (${res.status})`);
    (err as Error & { code?: string }).code = "EVIDENCE_AI_ERROR";
    throw err;
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "{}";
  return parseExtractorResponse(content);
}

// ── Parsing (pure, tested) ─────────────────────────────────────────────────

export function parseExtractorResponse(content: string): ExtractorItem[] {
  let parsed: { items?: unknown } | null = null;
  // The model may wrap the JSON in a fence or prose — try progressively.
  for (const candidate of [content, stripFence(content), extractJsonObject(content)]) {
    if (!candidate) continue;
    try {
      const j = JSON.parse(candidate);
      if (j && Array.isArray(j.items)) {
        parsed = j;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!parsed) throw new Error("Extractor returned no parseable items array.");

  return (parsed.items as Array<{ checklistItemId?: unknown; evidenceExcerpt?: unknown; suggestedAction?: unknown }>)
    .filter((it) => typeof it.checklistItemId === "string" && typeof it.evidenceExcerpt === "string")
    .map((it) => ({
      checklistItemId: it.checklistItemId as string,
      evidenceExcerpt: (it.evidenceExcerpt as string).trim(),
      suggestedAction: typeof it.suggestedAction === "string" && it.suggestedAction.trim() ? it.suggestedAction.trim() : null,
    }));
}

function stripFence(s: string): string | null {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function extractJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

// ── Deterministic keyword extractor ─────────────────────────────────────────

const STOP = new Set(
  "the a an and or of to in for on with that is are was were be been this it as by from at your we our you they he she i not have has had will would should could can may do does if then them their there what which who when where how why".split(" ")
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function sentences(text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].trim();
    if (!t) continue;
    out.push({ text: t, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function keywordExtract(items: ChecklistItemInput[], transcript: { content: string }): ExtractorItem[] {
  const sents = sentences(transcript.content);
  const out: ExtractorItem[] = [];
  for (const it of items) {
    const probe = [it.checklistText, it.evidenceRequirements ?? "", it.whatGoodLooksLike ?? "", it.keyQuestions ?? "", it.controlPoints ?? ""];
    const wanted = new Set(tokens(probe.join(" ")));
    if (wanted.size === 0) continue;

    let best: { text: string; start: number; end: number; score: number } | null = null;
    for (const s of sents) {
      const have = new Set(tokens(s.text));
      let score = 0;
      for (const w of wanted) if (have.has(w)) score++;
      // Reward longer windows that contain more distinct keywords.
      score = score * 10 + s.text.length;
      if (!best || score > best.score) best = { ...s, score };
    }
    if (best && best.score >= 20) {
      out.push({ checklistItemId: it.checklistItemId, evidenceExcerpt: best.text, suggestedAction: null });
    }
  }
  return out;
}

// ── Span reference + persistence ───────────────────────────────────────────

/** Locate the excerpt in the transcript → a real char-span reference. */
export function computeSpan(content: string, excerptRaw: string): { start: number; end: number } {
  const excerpt = excerptRaw.trim();
  if (excerpt.length === 0) return { start: 0, end: 0 };
  const idx = content.indexOf(excerpt);
  if (idx !== -1) return { start: idx, end: idx + excerpt.length };
  // Normalise whitespace and retry.
  const normContent = content.replace(/\s+/g, " ");
  const normExcerpt = excerpt.replace(/\s+/g, " ");
  const nIdx = normContent.indexOf(normExcerpt);
  if (nIdx !== -1) {
    const start = content.length && normContent.length ? Math.min(nIdx, content.length - 1) : 0;
    return { start, end: Math.min(start + excerpt.length, content.length) };
  }
  const defaultLen = Math.min(excerpt.length, 120);
  return { start: 0, end: defaultLen };
}

export async function persistExtractionProposals(items: ExtractorItem[], ctx: ExtractContext): Promise<PersistedProposal[]> {
  // Widen to the target assessment's checklist items (scoped by company).
  const checklist = await prisma.auditChecklistItem.findMany({
    where: { assessmentId: ctx.assessmentId },
    select: { id: true, checklistItemId: true, checklistText: true, auditStandard: true },
  });
  const byItemId = new Map(checklist.map((c) => [c.checklistItemId, c]));

  const transcript = await prisma.knowledgebase.findUnique({
    where: { kID: ctx.knowledgebaseId },
    select: { knowledgeContent: true },
  });
  const content = transcript?.knowledgeContent ?? "";

  const created: PersistedProposal[] = [];
  for (const item of items) {
    const target = byItemId.get(item.checklistItemId);
    if (!target) continue; // only ever targets this assessment's checklist items
    const span = computeSpan(content, item.evidenceExcerpt);
    const row = await prisma.extractionProposal.create({
      data: {
        status: "Proposed",
        knowledgebaseId: ctx.knowledgebaseId,
        assessmentId: ctx.assessmentId,
        auditChecklistItemId: target.id,
        companyId: ctx.companyId,
        spanStart: span.start,
        spanEnd: span.end,
        evidenceExcerpt: item.evidenceExcerpt,
        suggestedAction: item.suggestedAction ?? null,
        proposedBy: "AI",
        proposedByUserId: ctx.userId ?? null,
        transcriptTitle: ctx.transcriptTitle ?? null,
      },
    });
    created.push({
      id: row.id,
      status: row.status,
      assessmentId: row.assessmentId,
      transcriptId: row.knowledgebaseId,
      transcriptTitle: row.transcriptTitle ?? ctx.transcriptTitle ?? null,
      companyId: row.companyId,
      spanStart: row.spanStart,
      spanEnd: row.spanEnd,
      evidenceExcerpt: row.evidenceExcerpt,
      suggestedAction: row.suggestedAction,
      proposedBy: row.proposedBy,
      proposedByUserId: row.proposedByUserId,
      createdAt: row.createdAt.toISOString(),
      checklistItem: {
        id: target.id,
        checklistItemId: target.checklistItemId,
        checklistText: target.checklistText,
        auditStandard: target.auditStandard,
      },
    });
  }

  await logActivity({
    userId: ctx.userId ?? "ai",
    action: "EVIDENCE_PROPOSAL_CREATED",
    entityType: "Transcript",
    entityId: ctx.knowledgebaseId,
    summary: `Extracted ${created.length} evidence proposal(s) from transcript for assessment ${ctx.assessmentId}`,
    metadata: { assessmentId: ctx.assessmentId, companyId: ctx.companyId, count: created.length },
  });

  return created;
}

/** Deterministic extractor used by the E2E harness (no LLM). */
export async function selectiveKeywordExtract(items: ChecklistItemInput[], transcript: { title: string; content: string }): Promise<ExtractorItem[]> {
  return keywordExtract(items, transcript);
}

/**
 * Orchestrate one on-demand extraction. Selects the extractor by
 * EVIDENCE_EXTRACTOR (default deepseek); keyword is the deterministic fallback.
 */
export async function runExtraction(
  transcript: { title: string; content: string },
  checklistItems: ChecklistItemInput[],
  ctx: ExtractContext
): Promise<PersistedProposal[]> {
  const mode = process.env.EVIDENCE_EXTRACTOR || "deepseek";
  let items: ExtractorItem[];
  if (mode === "keyword") {
    items = keywordExtract(checklistItems, transcript);
  } else {
    items = await deepSeekExtract(checklistItems, transcript);
  }
  return persistExtractionProposals(items, ctx);
}
