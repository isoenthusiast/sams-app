import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";

/**
 * GET /api/admin/database/export-requirements?format=csv|json
 *
 * Exports SAMS001 requirements joined with ProcessArea name and description,
 * plus all associated control names (de-duplicated per requirement).
 */
export async function GET(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "csv";

    // Raw SQL join: Requirement → ProcessArea → MapControl2Requirement → Control
    const rows = await (prisma as any).$queryRawUnsafe(`
      SELECT
        r."rID"                      AS requirement_rid,
        r."requirementId"            AS requirement_id,
        r."clauseContent"            AS clause_content,
        r."intentOutcome"            AS intent_outcome,
        r."clauseApplicability"      AS clause_applicability,
        r."references"               AS requirement_references,
        r."applicable"               AS applicable,
        r."standard"                 AS standard,
        r."pID"                      AS process_id,
        r."createdAt"                AS requirement_created_at,
        pa."name"                    AS process_area_name,
        pa."description"             AS process_area_description,
        pa."createdAt"               AS pa_created_at,
        COALESCE(STRING_AGG(DISTINCT ct."name", ', ' ORDER BY ct."name"), '') AS mapped_control_names,
        COUNT(DISTINCT ct.id)::int        AS mapped_control_count
      FROM "Requirement" r
      LEFT JOIN "ProcessArea" pa ON pa.id = r."processAreaId"
      LEFT JOIN "MapControl2Requirement" mcr ON mcr."requirementRId" = r."rID"
      LEFT JOIN "Control" ct ON ct.id = mcr."controlId"
      WHERE r."companyId" = (SELECT id FROM "Company" WHERE "companyID" = 'SAMS001' LIMIT 1)
      GROUP BY r."rID", r."requirementId", r."clauseContent", r."intentOutcome",
               r."clauseApplicability", r."references", r."applicable",
               r."standard", r."pID", r."createdAt",
               pa.name, pa.description, pa."createdAt"
      ORDER BY r."requirementId"
    `) as any[];

    if (format === "json") {
      return NextResponse.json({
        exported_at: new Date().toISOString(),
        company: "SAMS001",
        total: rows.length,
        requirements: rows,
      });
    }

    if (rows.length === 0) {
      return new Response("No data", {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=SAMS_requirements.csv" },
      });
    }

    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(","),
      ...rows.map((row: any) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(",")
      ),
    ];

    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=SAMS_requirements.csv",
      },
    });
  } catch (error: any) {
    console.error("Error exporting requirements:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
