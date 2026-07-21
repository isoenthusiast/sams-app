import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";

/** Map PostgreSQL type to SQL DDL type */
function pgTypeToDDL(pgType: string, isNullable: string, hasDefault: string | null): string {
  const base = pgType.includes("timestamp") ? "TIMESTAMPTZ"
    : pgType === "integer" || pgType === "int4" ? "INTEGER"
    : pgType === "bigint" || pgType === "int8" ? "BIGINT"
    : pgType === "boolean" || pgType === "bool" ? "BOOLEAN"
    : pgType === "double precision" || pgType === "float8" ? "DOUBLE PRECISION"
    : pgType === "real" || pgType === "float4" ? "REAL"
    : pgType === "numeric" || pgType === "decimal" ? "DECIMAL"
    : pgType === "json" || pgType === "jsonb" ? "JSONB"
    : pgType === "bytea" ? "BYTEA"
    : pgType.includes("char") || pgType === "text" ? "TEXT"
    : pgType;

  let def = base;
  if (isNullable === "NO") def += " NOT NULL";
  if (hasDefault && !hasDefault.startsWith("nextval")) def += ` DEFAULT ${hasDefault}`;
  return def;
}

/** Escape a value for SQL INSERT */
function escapeSQL(value: any): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

export async function GET(_request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;

    // Get all table names
    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );

    const lines: string[] = [];
    lines.push(`-- Full Database Backup`);
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push(`-- Tables: ${tables.length}`);
    lines.push("");
    lines.push("BEGIN;");
    lines.push("");

    let totalRows = 0;

    for (const { name: tableName } of tables) {
      // Skip Prisma migration tables
      if (tableName === "_prisma_migrations" || tableName.startsWith("_")) continue;

      // Get column info from information_schema
      const cols = await prisma.$queryRawUnsafe<Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        ordinal_position: number;
      }>>(
        `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        tableName
      );

      if (cols.length === 0) continue;

      // Get primary key columns
      const pkCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
        tableName
      );
      const pkSet = new Set(pkCols.map((c) => c.column_name));

      // Get unique constraints (excluding PK)
      const uniqueConstraints = await prisma.$queryRawUnsafe<Array<{
        constraint_name: string;
        column_name: string;
      }>>(
        `SELECT tc.constraint_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
         ORDER BY tc.constraint_name, kcu.ordinal_position`,
        tableName
      );

      // Group unique columns by constraint name
      const uniqueGroups = new Map<string, string[]>();
      for (const uc of uniqueConstraints) {
        if (!uniqueGroups.has(uc.constraint_name)) uniqueGroups.set(uc.constraint_name, []);
        uniqueGroups.get(uc.constraint_name)!.push(uc.column_name);
      }

      // Build CREATE TABLE
      lines.push(`-- Table: ${tableName}`);
      lines.push(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
      lines.push(`CREATE TABLE "${tableName}" (`);

      const colDefs = cols.map((c) => {
        const isPK = pkSet.has(c.column_name);
        let def = `  "${c.column_name}" ${pgTypeToDDL(c.data_type, c.is_nullable, c.column_default)}`;
        if (isPK) def += " PRIMARY KEY";
        return def;
      });

      // Add unique constraints
      for (const [constraintName, colNames] of uniqueGroups) {
        colDefs.push(`  CONSTRAINT "${constraintName}" UNIQUE (${colNames.map((n) => `"${n}"`).join(", ")})`);
      }

      lines.push(colDefs.join(",\n"));
      lines.push(");");
      lines.push("");

      // Fetch all rows
      let rows: any[] = [];
      try {
        const result = await prisma.$queryRawUnsafe(`SELECT * FROM "${tableName}"`);
        rows = Array.isArray(result) ? result : [];
      } catch {
        lines.push(`-- Could not read rows from ${tableName}`);
        lines.push("");
        continue;
      }

      if (rows.length === 0) {
        lines.push(`-- 0 rows`);
        lines.push("");
        continue;
      }

      totalRows += rows.length;
      const colNames = cols.map((c) => c.column_name);

      // Batch INSERTs (100 rows per statement)
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const valuesList = batch.map((row) => {
          const vals = colNames.map((cn) => escapeSQL(row[cn]));
          return `(${vals.join(", ")})`;
        });
        lines.push(`INSERT INTO "${tableName}" (${colNames.map((n) => `"${n}"`).join(", ")}) VALUES`);
        lines.push(valuesList.join(",\n") + ";");
        lines.push("");
      }
    }

    lines.push("COMMIT;");
    lines.push("");
    lines.push(`-- Backup complete: ${tables.length} tables, ${totalRows} rows`);

    const sql = lines.join("\n");

    return new Response(sql, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="full_backup_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.sql"`,
      },
    });
  } catch (error) {
    console.error("Error creating backup:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
