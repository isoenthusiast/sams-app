import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { adoptContentPack } from "@/lib/content-rollforward";

export const dynamic = "force-dynamic";

/**
 * POST /api/operator/content/adopt — provider-gated. Adopts a ContentPack on the
 * client's behalf: applies the diff to the tenant's CONTENT baseline (selective
 * apply by stable key — never wipe-and-reload), marks removed-but-referenced
 * content as Superseded, audits the adoption WITH the diff attached, and notifies
 * the client's monitors (in-app + portal banner until acknowledged).
 *
 * Body { companyId, toVersion, dryRun? }. dryRun=true returns the diff + the
 * before-checksum WITHOUT writing (the operator preview). Client data
 * (audits/findings/actions/evidence/conclusions/controlAssignments) is never
 * touched — the before/after checksums in the response prove it.
 */
export async function POST(request: NextRequest) {
  const { session, response } = await requireProvider();
  if (response) return response;
  const body = await request.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;
  const toVersion = body.toVersion as number | undefined;
  const dryRun = body.dryRun === true;
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  if (typeof toVersion !== "number") return NextResponse.json({ error: "toVersion is required" }, { status: 400 });
  const userId = (session.user as { id?: string }).id ?? null;
  try {
    const result = await adoptContentPack({ companyId, toVersion, dryRun, adoptedByUserId: userId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const msg = e?.message || "Adopt failed";
    const status = /not found|No update/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
