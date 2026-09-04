import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { publishContentPack } from "@/lib/content-rollforward";

export const dynamic = "force-dynamic";

/**
 * POST /api/operator/content/publish — provider-gated. Publishes an immutable
 * snapshot of the SAMS001 master content as the NEXT ContentPack version.
 * Optional body { fromVersion } is an optimistic-concurrency guard: if provided,
 * the latest published version MUST equal it or we 409 (a concurrent publish
 * landed). A publish NEVER mutates an existing pack — it always creates a new row.
 */
export async function POST(request: NextRequest) {
  const { session, response } = await requireProvider();
  if (response) return response;
  const body = await request.json().catch(() => ({}));
  const fromVersion = typeof body.fromVersion === "number" ? body.fromVersion : undefined;
  const userId = (session.user as { id?: string }).id ?? null;
  try {
    const { packId, version } = await publishContentPack({ fromVersion, publishedById: userId });
    return NextResponse.json({ ok: true, packId, version });
  } catch (e: any) {
    const msg = e?.message || "Publish failed";
    const status = /Concurrent publish/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
