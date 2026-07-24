import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findApplicableRules, calculatePoints, awardPoints, seedStandardRules, type EventContext } from "@/lib/gamification/ruleEngine";
import { evaluateBadges } from "@/lib/gamification/badgeEngine";

/**
 * POST /api/admin/gamification/import-csv
 *
 * Accepts a CSV file + source + eventType. Parses rows and creates gamification events.
 *
 * FormData:
 *   file: CSV file (must have 'userId' column, or uses uploader's userId)
 *   source: string (e.g., "CMMS", "LMS", "CSV_IMPORT")
 *   eventType: string (e.g., "work_order_complete", "training_passed")
 *   useUploaderId: "true" | "false" (if true, ignores CSV userId column)
 *
 * CSV columns:
 *   userId (optional if useUploaderId=true)
 *   Any other columns become context.metadata fields
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "Admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = formData.get("source") as string;
    const eventType = formData.get("eventType") as string;
    const useUploaderId = formData.get("useUploaderId") === "true";

    if (!file || !source || !eventType) {
      return NextResponse.json(
        { error: "file, source, and eventType are required" },
        { status: 400 }
      );
    }

    // Parse CSV
    const csvText = await file.text();
    const rows = parseCSV(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV file is empty or has no data rows" }, { status: 400 });
    }

    // Ensure rules exist
    await seedStandardRules();

    const uploaderId = (session.user as any).id;
    const ctx: EventContext = {};
    let totalPoints = 0;
    let totalBadges = 0;
    let rowsProcessed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const userId = useUploaderId ? uploaderId : (row.userId || uploaderId);
        if (!userId) {
          errors.push(`Row ${i + 1}: no userId`);
          continue;
        }

        // Build metadata from non-userId columns
        const metadata: Record<string, any> = {};
        for (const key of Object.keys(row)) {
          if (key !== "userId") metadata[key] = row[key];
        }

        const universalRules = await findApplicableRules(source, eventType, null, null);
        for (const rule of universalRules) {
          const match = calculatePoints(rule, 1);
          if (match.adjustedPoints > 0) {
            const awarded = await awardPoints(userId, match, `${source}.${eventType} (CSV row ${i + 1})`, {
              ...ctx,
              metadata,
            });
            totalPoints += awarded.pointsAwarded;
          }
        }

        // Evaluate badges
        const badgeResults = await evaluateBadges(userId);
        totalBadges += badgeResults.filter(b => b.earned).length;
        rowsProcessed++;
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      source,
      eventType,
      rowsInFile: rows.length,
      rowsProcessed,
      totalPointsAwarded: totalPoints,
      badgesAwarded: totalBadges,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Show first 10 errors
    });
  } catch (err: any) {
    console.error("[import-csv] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Simple CSV parser — handles quoted fields and commas within quotes.
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return []; // Need header + at least 1 data row

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] || "").trim();
    }
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
