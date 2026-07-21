import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";

export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;

    // Read SQL file from form data
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No SQL file provided. Use form field 'file'." }, { status: 400 });
    }

    const sqlText = await file.text();
    if (!sqlText.trim()) {
      return NextResponse.json({ error: "SQL file is empty" }, { status: 400 });
    }

    // Parse SQL into individual statements
    // Split on semicolons but respect string literals
    const statements = splitSQL(sqlText);

    let executed = 0;
    let errors: string[] = [];
    const skipped: string[] = [];

    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      // Skip comments and empty
      if (trimmed.startsWith("--")) { skipped.push(trimmed.slice(0, 80)); continue; }

      try {
        await prisma.$executeRawUnsafe(trimmed);
        executed++;
      } catch (e: any) {
        const shortMsg = e.message?.slice(0, 120) || "Unknown error";
        errors.push(shortMsg);
        // Stop on first error to avoid cascading damage
        if (errors.length >= 20) break;
      }
    }

    const result: any = {
      ok: errors.length === 0,
      total: statements.filter((s) => s.trim() && !s.trim().startsWith("--")).length,
      executed,
      skipped: skipped.length,
    };
    if (errors.length > 0) {
      result.errors = errors;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error restoring backup:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Split SQL text into individual statements.
 * Handles semicolons inside string literals and dollar-quoted strings.
 */
function splitSQL(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDollar = false;
  let dollarTag = "";

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && sql[i + 1] === "'") {
        current += "'";
        i++; // skip escaped quote
      } else if (ch === "'") {
        inSingleQuote = false;
      }
    } else if (inDollar) {
      current += ch;
      // Look for closing dollar tag
      if (ch === "$" && sql.slice(i, i + dollarTag.length) === dollarTag) {
        current += dollarTag.slice(1);
        i += dollarTag.length - 1;
        inDollar = false;
        dollarTag = "";
      }
    } else {
      if (ch === "'") {
        inSingleQuote = true;
        current += ch;
      } else if (ch === "$" && sql[i + 1] === "$") {
        // Simple $$...$$ dollar quoting
        inDollar = true;
        dollarTag = "$$";
        current += "$$";
        i++;
      } else if (ch === "$" && /[a-zA-Z]/.test(sql[i + 1] || "")) {
        // Named dollar quoting: $tag$...$tag$
        const match = sql.slice(i).match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*\$)/);
        if (match) {
          inDollar = true;
          dollarTag = match[1];
          current += dollarTag;
          i += dollarTag.length - 1;
        } else {
          current += ch;
        }
      } else if (ch === ";") {
        statements.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  // Push remaining
  if (current.trim()) {
    statements.push(current);
  }

  return statements;
}
