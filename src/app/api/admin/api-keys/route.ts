import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import {
  authorizeApiKeyManager,
  generateApiKey,
  toApiKeySummary,
  API_KEY_LABEL_MAX,
} from "@/lib/api-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SAMS-011 key management (settled decision #5 — client Admin of a company + provider).
 *
 * POST /api/admin/api-keys   — create a key. Body: { companyId?, label }.
 *   - Returns `key` (PLAINTEXT) ONCE. Only the bcrypt hash is stored — the
 *     plaintext is never persisted, logged, or returned again.
 *   - client Admin: `companyId` optional (defaults to their company); must be a
 *     company they belong to. Provider: `companyId` required.
 *
 * GET /api/admin/api-keys?companyId=  — list keys.
 *   - Returns label/createdAt/lastUsedAt/revokedAt + creator — NEVER keyHash or
 *     any key material.
 */
export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (label.length > API_KEY_LABEL_MAX) {
    return NextResponse.json({ error: `label must be ≤ ${API_KEY_LABEL_MAX} characters` }, { status: 422 });
  }

  const scope = await authorizeApiKeyManager(
    typeof body.companyId === "string" ? body.companyId : null
  );
  if (!scope.ok) return scope.response;

  const { plaintext, hash } = generateApiKey();
  let created;
  try {
    created = await prisma.apiKey.create({
      data: {
        companyId: scope.companyId,
        keyHash: hash,
        label,
        createdByUserId: scope.userId,
      },
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity({
    activityType: "API_KEY_CREATE",
    description: `${scope.isProvider ? "Provider" : "Client Admin"} created an API key "${label}" for ${scope.company.companyName} (${scope.company.companyID})`,
    username: scope.userId,
    refTable: "ApiKey",
    refRecord: created.id,
    beforeData: null,
    afterData: { companyId: scope.companyId, label },
  });

  // Return the PLAINTEXT exactly once. Never stored again, never logged, never in
  // the list endpoint.
  return NextResponse.json(
    {
      keyId: created.id,
      key: plaintext,
      label: created.label,
      companyId: scope.companyId,
      createdAt: created.createdAt.toISOString(),
      note: "This is the only time the key is shown. Store it securely; only its hash is retained.",
    },
    { status: 201 }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyIdParam = url.searchParams.get("companyId");
  const scope = await authorizeApiKeyManager(companyIdParam);
  if (!scope.ok) return scope.response;

  try {
    const rows = await prisma.apiKey.findMany({
      where: { companyId: scope.companyId },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    // toApiKeySummary drops any key material by construction (whitelist).
    return NextResponse.json({ companyId: scope.companyId, keys: rows.map(toApiKeySummary) });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
