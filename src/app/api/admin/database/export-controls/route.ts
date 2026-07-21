import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";

/**
 * GET /api/admin/database/export-controls?format=csv|json
 *
 * Exports SAMS001 controls joined with ProcessArea name and
 * all associated Requirement IDs (clause numbers), de-duplicated.
 */
export async function GET(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "csv";

    // Raw SQL join: Control → ProcessArea → MapControl2Requirement → Requirement
    const rows = await (prisma as any).$queryRawUnsafe(`
      SELECT
        ct."id"                    AS control_id,
        ct."name"                  AS control_name,
        ct."statement"             AS control_statement,
        ct."controlType"           AS control_type,
        ct."controlTypeDetail"     AS control_type_detail,
        ct."controlRef"            AS control_ref,
        ct."isHsseCritical"        AS is_hsse_critical,
        ct."ramRating"             AS ram_rating,
        ct."riskWeight"            AS risk_weight,
        ct."rawHealthScore"        AS raw_health_score,
        ct."lastTestedDate"        AS last_tested_date,
        ct."lastTestResult"        AS last_test_result,
        ct."standard"              AS standard,
        ct."csfWho"                AS csf_who,
        ct."csfWhat"               AS csf_what,
        ct."csfWhen"               AS csf_when,
        ct."csfWhere"              AS csf_where,
        ct."csfWhy"                AS csf_why,
        ct."csfHow"                AS csf_how,
        ct."csfEvidence"           AS csf_evidence,
        ct."keyActivities"         AS key_activities,
        ct."riskAddressed"         AS risk_addressed,
        ct."testingApproach"       AS testing_approach,
        ct."sourceFile"            AS source_file,
        ct."practiceDocument"      AS practice_document,
        ct."uncertainFlags"        AS uncertain_flags,
        ct."createdAt"             AS control_created_at,
        pa."name"                  AS process_area_name,
        pa."description"           AS process_area_description,
        COALESCE(STRING_AGG(DISTINCT r."requirementId", ', '), '') AS requirement_ids,
        COALESCE(STRING_AGG(DISTINCT r."clauseContent", ' | '), '') AS requirement_clauses
      FROM "Control" ct
      JOIN "ProcessArea" pa ON pa.id = ct."processAreaId"
      LEFT JOIN "MapControl2Requirement" mcr ON mcr."controlId" = ct.id
      LEFT JOIN "Requirement" r ON r."rID" = mcr."requirementRId"
      WHERE ct."companyId" = (SELECT id FROM "Company" WHERE "companyID" = 'SAMS001' LIMIT 1)
      GROUP BY ct.id, pa.name, pa.description
      ORDER BY pa.name, ct.name
    `) as any[];

    if (format === "json") {
      return NextResponse.json({
        exported_at: new Date().toISOString(),
        company: "SAMS001",
        total: rows.length,
        controls: rows,
      });
    }

    // Build CSV with header row from keys of first row
    if (rows.length === 0) {
      return new Response("No data", {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=SAMS_controls.csv" },
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
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
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
        "Content-Disposition": "attachment; filename=SAMS_controls.csv",
      },
    });
  } catch (error: any) {
    console.error("Error exporting controls:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
