import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { buildExportPackage } from "@/lib/data-trust-export";
import { buildZip } from "@/lib/zip";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/admin/companies/[id]/export
 *
 * Client-data export package (T4, Data Trust Gate). Streams a per-company ZIP of
 * CSVs + manifest.json. Authorized: Admin, or Provider (provider use writes a
 * COMPANY_EXPORT context audit row). This is a SEPARATE, per-company export — it
 * deliberately does NOT reuse the whole-DB backup route (which spans tenants).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  const user = session?.user as
    | { id?: string; name?: string; role?: string; providerRole?: string | null }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = user.role === "Admin";
  const isProviderUser = !!user.providerRole;
  if (!isAdmin && !isProviderUser) {
    return NextResponse.json({ error: "Admin or provider access required" }, { status: 403 });
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, companyID: true, companyName: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Provider use is audited (context row).
  if (isProviderUser) {
    await logActivity({
      activityType: "COMPANY_EXPORT",
      description: `Provider ${user.name ?? ""} produced a client-data export for ${company.companyName} (${company.companyID})`,
      username: user.name ?? user.id ?? "unknown",
      refTable: "Company",
      refRecord: company.id,
      beforeData: { exportRequestedBy: "provider" },
      afterData: { companyId: company.id },
    });
  }

  const pkg = await buildExportPackage(company.id);

  // manifest.json is stored UNCOMPRESSED so it is human-inspectable in the ZIP and
  // byte-scannable by scripts/db/company_hard_delete.ts (which must verify the
  // export belongs to the target company before any destructive delete).
  const zipBuf = buildZip(
    pkg.entries.map((e) => ({ name: e.file, data: e.content, store: e.file === "manifest.json" }))
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new Response(zipBuf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="company_${company.companyID}_export_${stamp}.zip"`,
      "Content-Length": String(zipBuf.length),
    },
  });
}
