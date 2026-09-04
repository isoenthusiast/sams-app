import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CompanyValidationError = { field: "companyID" | "companyName"; code: string; message: string };

/**
 * POST /api/operator/onboarding/company
 * Step 1 — Company basics (provider-gated).
 *
 * body: { companyID, companyName, shortName?, referenceID?, dryRun }
 *   - dryRun=true  (the "Dry-run" action): validate ONLY — duplicate companyID,
 *     missing fields. Returns { ok, errors, duplicate }. NEVER writes.
 *   - dryRun=false (the "Commit" action): create the company row. Returns the
 *     created company, or 409 when the companyID is already taken (a race after
 *     the dry-run passed).
 */
export async function POST(request: NextRequest) {
  const { response } = await requireProvider();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const companyID = body.companyID?.trim() ?? "";
  const companyName = body.companyName?.trim() ?? "";
  const dryRun = body.dryRun !== false;

  const errors: CompanyValidationError[] = [];
  if (!companyID) errors.push({ field: "companyID", code: "REQUIRED", message: "companyID is required" });
  if (!companyName) errors.push({ field: "companyName", code: "REQUIRED", message: "companyName is required" });

  let duplicate = false;
  if (companyID) {
    const existing = await prisma.company.findUnique({ where: { companyID } });
    duplicate = existing !== null;
    if (duplicate) {
      errors.push({ field: "companyID", code: "DUPLICATE", message: `Company ID "${companyID}" already exists` });
    }
  }

  if (dryRun) {
    return NextResponse.json({ ok: errors.length === 0, duplicate, errors });
  }

  if (!companyID || !companyName) {
    return NextResponse.json({ error: "companyID and companyName are required" }, { status: 400 });
  }
  // Re-check after any await gap (the dry-run may have been a while ago).
  const existing = await prisma.company.findUnique({ where: { companyID } });
  if (existing) {
    return NextResponse.json({ error: "Company ID already exists", field: "companyID", code: "DUPLICATE" }, { status: 409 });
  }

  const company = await prisma.company.create({
    data: {
      companyID,
      companyName,
      shortName: body.shortName?.trim() || null,
      referenceID: body.referenceID?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, company: { id: company.id, companyID: company.companyID, companyName: company.companyName } }, { status: 201 });
}
