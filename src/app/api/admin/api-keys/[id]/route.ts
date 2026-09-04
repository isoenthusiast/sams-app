import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { authorizeApiKeyManager, toApiKeySummary } from "@/lib/api-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/admin/api-keys/[id] — revoke (settled decision #5).
 *
 * Sets `revokedAt` (idempotent — revoking an already-revoked key is a no-op).
 * A revoked key is rejected by the public endpoints with 403. Revoking does NOT
 * delete the row (audit trail); only the key's company Admin/manager (or the
 * provider plane) may act, scoped to the company the KEY belongs to.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const existing = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, companyId: true, revokedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const scope = await authorizeApiKeyManager(existing.companyId);
  if (!scope.ok) return scope.response;

  try {
    const updated = await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: existing.revokedAt ?? new Date() },
      include: { createdByUser: { select: { id: true, name: true } } },
    });

    await logActivity({
      activityType: "API_KEY_REVOKE",
      description: `${scope.isProvider ? "Provider" : "Client Admin"} revoked API key "${updated.label}" for ${scope.company.companyName} (${scope.company.companyID})`,
      username: scope.userId,
      refTable: "ApiKey",
      refRecord: updated.id,
      beforeData: { revokedAt: existing.revokedAt?.toISOString() ?? null },
      afterData: { revokedAt: updated.revokedAt?.toISOString() ?? null },
    });

    return NextResponse.json({ revoked: true, key: toApiKeySummary(updated) });
  } catch (error) {
    console.error("Error revoking API key:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
