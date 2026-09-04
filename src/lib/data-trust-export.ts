import { prisma } from "@/lib/prisma";

/**
 * Data Trust Gate — client-data export package (T4).
 *
 * Builds a per-company ZIP of CSV files (one per company-scoped table) plus a
 * `manifest.json`. Contracts:
 *   - NEVER reuses the whole-DB backup route (it spans tenants).
 *   - Hard-coded EXCLUSION list (unit-tested): password hashes, session/token
 *     data, other tenants' anything. ActivityLog `beforeData`/`afterData` raw
 *     payloads are excluded (counts only) — ActivityLog rows are not exported
 *     by company because the table carries no companyId.
 *   - Every export query is scoped by companyId (direct column or declared
 *     nested-relation traversal) — see the `scope` on each table def. This is
 *     what the isolation scan (scripts/isolation) asserts against.
 */

export type ExportTableDef = {
  /** CSV file leaf name inside the ZIP. */
  file: string;
  /** Prisma model key (used for the manifest name). */
  model: string;
  /** Prisma model accessor on the `prisma` singleton, e.g. "standard". */
  accessor: string;
  /** Human description for the manifest. */
  label: string;
  /** Build a company-scoped `where` clause (may be async — Risk/RiskCategory
   * scope by `processAreaId` via a process-area subquery). Used by
   * writeToCsv + isolation scan. */
  where: (companyId: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Columns to strip from every row (defense-in-depth; also enforced additively). */
  excludeColumns?: string[];
};

/**
 * Hard-coded exclusion list. Every column name listed here is removed from any
 * exported CSV, and the strings are scanned by the isolation suite against the
 * archive as a belt-and-braces check. Extend here — never ad hoc in the route.
 */
export const EXCLUSION_COLUMNS: string[] = [
  "passwordHash",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "sessionData",
  "secret",
  "apiKey",
  "beforeData",
  "afterData",
  // SAMS-009: write-only webhook secret — never exported.
  "notificationWebhookUrl",
];

const byCompany = (companyId: string) => ({ companyId });

/** Company's process-area ids (for models scoped via the scalar processAreaId FK,
 * e.g. Risk / RiskCategory, which have no `processArea` relation). */
async function processAreaIds(companyId: string): Promise<string[]> {
  const rows = await prisma.processArea.findMany({
    where: { companyId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ── The company-scoped table catalogue for export ──────────────────────────
// `scope` states the company predicate. Direct-column models filter on
// companyId; relation-traversal models filter through the owning relationship.
export const EXPORT_TABLES: ExportTableDef[] = [
  { file: "company.csv", model: "Company", accessor: "company", label: "Company (root)", where: (cid) => ({ id: cid }) },
  { file: "standards.csv", model: "Standard", accessor: "standard", label: "Management system standards", where: byCompany },
  { file: "process_areas.csv", model: "ProcessArea", accessor: "processArea", label: "Process areas", where: byCompany },
  { file: "sub_processes.csv", model: "SubProcess", accessor: "subProcess", label: "Sub-processes", where: byCompany },
  { file: "requirements.csv", model: "Requirement", accessor: "requirement", label: "Requirements (incl. SOC status/summary)", where: byCompany },
  { file: "controls.csv", model: "Control", accessor: "control", label: "Controls (incl. all CSF fields)", where: byCompany },
  { file: "control_sub_processes.csv", model: "ControlSubProcess", accessor: "controlSubProcess", label: "Control↔SubProcess junction", where: (cid) => ({ control: { companyId: cid } }) },
  { file: "mappings.csv", model: "MapControl2Requirement", accessor: "mapControl2Requirement", label: "Control↔Requirement mappings (incl. mandatory flag)", where: (cid) => ({ control: { companyId: cid } }) },
  { file: "assessments.csv", model: "Assessment", accessor: "assessment", label: "Assessments", where: byCompany },
  { file: "assessment_assessors.csv", model: "AssessmentAssessor", accessor: "assessmentAssessor", label: "Assessment↔Assessor junction", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "control_assignments.csv", model: "ControlAssignment", accessor: "controlAssignment", label: "Assessment↔Control assignments", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "requirement_conclusions.csv", model: "RequirementConclusion", accessor: "requirementConclusion", label: "Requirement conclusions", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "samples.csv", model: "Sample", accessor: "sample", label: "Samples", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "findings.csv", model: "Finding", accessor: "finding", label: "Findings", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "actions.csv", model: "Action", accessor: "action", label: "Actions", where: (cid) => ({ finding: { assessment: { companyId: cid } } }) },
  { file: "aacts.csv", model: "Aact", accessor: "aact", label: "Assessment activities", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "aact_controls.csv", model: "AActControls", accessor: "aActControls", label: "Assessment activity↔Control junction", where: (cid) => ({ aact: { assessment: { companyId: cid } } }) },
  { file: "aact_users.csv", model: "AActUsers", accessor: "aActUsers", label: "Assessment activity↔User junction", where: (cid) => ({ aact: { assessment: { companyId: cid } } }) },
  { file: "aact_details.csv", model: "AActDetails", accessor: "aActDetails", label: "Assessment activity details", where: (cid) => ({ aact: { assessment: { companyId: cid } } }) },
  { file: "knowledgebase.csv", model: "Knowledgebase", accessor: "knowledgebase", label: "Knowledge-base entries", where: byCompany },
  { file: "tags.csv", model: "Tag", accessor: "tag", label: "Tags", where: byCompany },
  { file: "knowledgebase_tags.csv", model: "KnowledgebaseTag", accessor: "knowledgebaseTag", label: "Knowledgebase↔Tag junction", where: (cid) => ({ kbase: { companyId: cid } }) },
  { file: "users.csv", model: "User", accessor: "user", label: "Users", where: (cid) => ({ companyId: cid }), excludeColumns: ["passwordHash"] },
  { file: "user_companies.csv", model: "UserCompany", accessor: "userCompany", label: "User↔Company mappings", where: (cid) => ({ companyId: cid }) },
  { file: "departments.csv", model: "Department", accessor: "department", label: "Departments", where: byCompany },
  { file: "positions.csv", model: "Position", accessor: "position", label: "Positions", where: (cid) => ({ department: { companyId: cid } }) },
  { file: "documents.csv", model: "Document", accessor: "document", label: "Documents", where: byCompany },
  { file: "map_requirement_documents.csv", model: "MapRequirement2Document", accessor: "mapRequirement2Document", label: "Requirement↔Document junctions", where: (cid) => ({ document: { companyId: cid } }) },
  { file: "gamification_stage.csv", model: "GamificationStage", accessor: "gamificationStage", label: "Gamification stage", where: (cid) => ({ companyId: cid }) },
  { file: "point_transactions.csv", model: "PointTransaction", accessor: "pointTransaction", label: "Gamification point transactions", where: (cid) => ({ user: { companyId: cid } }) },
  { file: "user_achievements.csv", model: "UserAchievement", accessor: "userAchievement", label: "Gamification user achievements", where: (cid) => ({ user: { companyId: cid } }) },
  { file: "risks.csv", model: "Risk", accessor: "risk", label: "Risks", where: async (cid) => ({ processAreaId: { in: (await processAreaIds(cid)) } }) },
  { file: "risk_metrics.csv", model: "RiskMetrics", accessor: "riskMetrics", label: "Risk metrics", where: async (cid) => ({ risk: { processAreaId: { in: (await processAreaIds(cid)) } } }) },
  { file: "risk_categories.csv", model: "RiskCategory", accessor: "riskCategory", label: "Risk categories", where: async (cid) => ({ processAreaId: { in: (await processAreaIds(cid)) } }) },
  { file: "audit_checklist_templates.csv", model: "AuditChecklistTemplate", accessor: "auditChecklistTemplate", label: "Audit checklist templates", where: byCompany },
  { file: "audit_checklist_template_items.csv", model: "AuditChecklistTemplateItem", accessor: "auditChecklistTemplateItem", label: "Audit checklist template items", where: (cid) => ({ template: { companyId: cid } }) },
  { file: "audit_checklist_items.csv", model: "AuditChecklistItem", accessor: "auditChecklistItem", label: "Audit checklist items (per assessment)", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "assessment_checklist_controls.csv", model: "AssessmentChecklistControl", accessor: "assessmentChecklistControl", label: "Checklist↔Control junctions", where: (cid) => ({ assessment: { companyId: cid } }) },
  { file: "backlog_item_controls.csv", model: "BacklogItemControl", accessor: "backlogItemControl", label: "Backlog↔Control junctions", where: (cid) => ({ backlogItem: { companyId: cid } }) },
  { file: "audit_checklist_requirements.csv", model: "AuditChecklist2Requirement", accessor: "auditChecklist2Requirement", label: "Checklist↔Requirement junctions", where: (cid) => ({ requirement: { companyId: cid } }) },
  { file: "control_risks.csv", model: "ControlRisk", accessor: "controlRisk", label: "Control↔Risk junctions", where: (cid) => ({ control: { companyId: cid } }) },
  { file: "user_role_mappings.csv", model: "UserRoleMapping", accessor: "userRoleMapping", label: "User↔Role mappings", where: (cid) => ({ userRole: { companyId: cid } }) },
];

// ── CSV helpers ────────────────────────────────────────────────────────────

function toCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, columnOrder?: string[]): string {
  if (rows.length === 0) return "";
  const columns = columnOrder ?? Object.keys(rows[0]);
  const header = columns.map(toCsvCell).join(",");
  const lines = rows.map((r) => columns.map((c) => toCsvCell(r[c])).join(","));
  return [header, ...lines].join("\n");
}

/** Defensive strip of every excluded column name from a raw row. */
function stripExcluded(row: Record<string, unknown>, exclude: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const unsafe = EXCLUSION_COLUMNS.some(
      (e) => k === e || k.toLowerCase().includes(e.toLowerCase())
    ) || exclude.some((e) => k === e);
    if (!unsafe) next[k] = v;
  }
  return next;
}

async function fetchRows(def: ExportTableDef, companyId: string): Promise<Array<Record<string, unknown>>> {
  const model = (prisma as unknown as Record<string, { findMany: (args: { where: Record<string, unknown> }) => Promise<unknown[]> }>)[def.accessor];
  if (!model) throw new Error(`Unknown Prisma accessor: ${def.accessor}`);
  const where = await def.where(companyId);
  const rows = await model.findMany({ where });
  return rows.map((r) => stripExcluded(r as Record<string, unknown>, def.excludeColumns ?? []));
}

export type ExportPackage = {
  entries: Array<{ file: string; content: string }>;
  manifest: {
    companyId: string;
    companyCode: string;
    companyName: string;
    exportedAt: string;
    schemaVersion: string;
    outputFormat: string;
    exclusionList: string[];
    activityLog: { note: string; included: boolean };
    tables: Array<{ model: string; file: string; label: string; rowCount: number }>;
    totalRows: number;
  };
};

const SCHEMA_VERSION = "1.0.0";

export async function buildExportPackage(companyId: string): Promise<ExportPackage> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, companyID: true, companyName: true },
  });
  if (!company) throw new Error("Company not found");

  const entries: ExportPackage["entries"] = [];
  const tables: ExportPackage["manifest"]["tables"] = [];
  let totalRows = 0;

  for (const def of EXPORT_TABLES) {
    const rows = await fetchRows(def, companyId);
    const csv = rowsToCsv(rows);
    if (csv.length > 0) entries.push({ file: def.file, content: csv });
    tables.push({ model: def.model, file: def.file, label: def.label, rowCount: rows.length });
    totalRows += rows.length;
  }

  const manifest: ExportPackage["manifest"] = {
    companyId: company.id,
    companyCode: company.companyID,
    companyName: company.companyName,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    outputFormat: "per-company CSV ZIP",
    exclusionList: [...EXCLUSION_COLUMNS],
    activityLog: {
      note: "ActivityLog rows are not company-scoped and are NOT exported; only counts are surfaced here. Raw beforeData/afterData payloads are never included.",
      included: false,
    },
    tables,
    totalRows,
  };

  entries.unshift({ file: "manifest.json", content: JSON.stringify({ _manifest: manifest }, null, 2) });

  return { entries, manifest };
}
