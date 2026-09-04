import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { previewBootstrap, runBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

/**
 * Content adoption step (SAMS-008, step 2) — provider-gated.
 *
 * GET  /api/operator/onboarding/content — read-only inventory: the master pack
 *      and the counts `previewBootstrap` says a commit would produce. This is the
 *      step's dry-run panel (no writes).
 * POST /api/operator/onboarding/content — body { companyId, dryRun }
 *      - dryRun=true  → returns the same preview counts sans any write.
 *      - dryRun=false → runs the existing bootstrap (`runBootstrap`, the single
 *        adoption path) for the company; returns the per-table results.
 *
 * Settled decision #2: content adoption REUSES the existing bootstrap, it does
 * not reimplement it.
 */

export async function GET() {
  const { response } = await requireProvider();
  if (response) return response;

  const preview = await previewBootstrap("__preview__");
  const packs = [
    {
      id: "smds-master",
      name: "SMDS Master Assurance Content",
      description:
        "Standards → Process Areas → Requirements → Controls → Control-Requirement mappings adopted from SAMS001.",
      selected: true,
    },
  ];
  return NextResponse.json({ packs, preview });
}

export async function POST(request: NextRequest) {
  const { response } = await requireProvider();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;
  const dryRun = body.dryRun !== false;

  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const preview = await previewBootstrap(companyId);

  if (dryRun) {
    return NextResponse.json({ ok: true, preview });
  }

  try {
    const result = await runBootstrap(companyId);
    return NextResponse.json({ ok: true, results: result.results, preview });
  } catch (e: any) {
    const msg = e?.message || "Bootstrap failed";
    const status = /Cannot bootstrap/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
