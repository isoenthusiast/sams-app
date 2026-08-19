import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/export/controls?companyId=<id>
 *
 * Company-scoped Control export as CSV (Admin only).
 *
 * Row semantics (agreed in grilling, 2026-08-19):
 *   - One row per Control × Requirement mapping (many-to-many -> duplicated
 *     control rows).
 *   - Unmapped controls are included once, with blank requirement columns.
 *   - Columns: every business column on Control (introspected at runtime,
 *     internal/audit columns excluded), plus requirement_id / requirement_clause
 *     / intent / applicability, the control's and the requirement's ProcessArea
 *     and Standard (both pairs), and the mapping mandatory flag.
 */
const CONTROL_EXCLUDE = new Set([
  "id",
  "companyId",
  "processAreaId",
  "createdAt",
  "updatedAt",
  "mappedAt",
  "reconciledAt",
  "practiceDocumentId",
]);

async function controlColumns(): Promise<string[]> {
  const rows = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'Control' ORDER BY ordinal_position`,
  )) as any[];
  return rows.map((r) => r.column_name).filter((c) => !CONTROL_EXCLUDE.has(c));
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const company = (await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, companyID: true },
    })) as { id: string; companyID: string } | null;
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const cols = await controlColumns();
    // alias exactly as "control_<col>" so the CSV header lookup matches row keys
    const colExprs = cols.map((c) => `ct."${c}" AS "control_${c}"`).join(",\n        ");

    const rows = (await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        ${colExprs},
        r."requirementId"       AS "requirement_id",
        r."clauseContent"       AS "requirement_clause",
        r."intentOutcome"       AS "intent",
        r."clauseApplicability" AS "applicability",
        cp."name"               AS "control_process_area",
        ct."standard"           AS "control_standard",
        rp."name"               AS "requirement_process_area",
        r."standard"            AS "requirement_standard",
        mcr."mandatory"         AS "mapping_mandatory"
      FROM "Control" ct
      LEFT JOIN "ProcessArea" cp ON cp.id = ct."processAreaId"
      LEFT JOIN "MapControl2Requirement" mcr ON mcr."controlId" = ct.id
      LEFT JOIN "Requirement" r ON r."rID" = mcr."requirementRId"
      LEFT JOIN "ProcessArea" rp ON rp.id = r."processAreaId"
      WHERE ct."companyId" = $1
      ORDER BY ct."name", r."requirementId"
      `,
      companyId,
    )) as any[];

    // Header order: control columns (introspected order), then req + linkage
    const header = [
      ...cols.map((c) => `control_${c}`),
      "requirement_id",
      "requirement_clause",
      "intent",
      "applicability",
      "control_process_area",
      "control_standard",
      "requirement_process_area",
      "requirement_standard",
      "mapping_mandatory",
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push(header.map((h) => csvCell(r[h])).join(","));
    }

    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    const filename = `${company.companyID}_controls_${ts}.csv`;

    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting controls:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
