import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Drift detection for the Data Trust Gate isolation suite.
 *
 * Coverage by construction:
 *  - ROUTE drift — every isolation-relevant API route must appear in
 *    route_matrix.json. A new route that ships without a matrix entry FAILS.
 *  - MODEL drift — every Prisma model carrying a `companyId` column must appear
 *    in model_matrix.json; every export-catalogue model must too.
 *
 * These are the two "orphan" detectors the spec requires (T1 §28 / §6).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function apiRoot(): string {
  return path.resolve(__dirname, "../../src/app/api");
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8")) as T;
}

// Shared with scripts/isolation/route_matrix.json (globalExempt array).
const GLOBAL_PREFIXES = ["auth", "health", "webhooks", "chat", "my", "operator"];

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRouteFiles(p));
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

/** Detect portal PAGE routes (server components serving company-scoped data). */
function walkPortalPageFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPortalPageFiles(p));
    else if (entry.name === "page.tsx") out.push(p);
  }
  return out;
}

export function detectScopedRoutes(): string[] {
  const root = apiRoot();
  const portalRoot = path.resolve(__dirname, "../../src/app/portal");
  const fullExempt = new Set<string>(readJson<{ globalExempt: string[] }>("route_matrix.json").globalExempt);
  const apiRoutes = walkRouteFiles(root)
    .map((p) => path.relative(root, p).replace(/\/route\.ts$/, "").replace(/\\/g, "/"))
    .sort();
  // Portal page routes ("portal", "portal/findings", …) — client-company scoped.
  const portalRoutes = walkPortalPageFiles(portalRoot)
    .map((p) => path.relative(portalRoot, p).replace(/\/?page\.tsx$/, "").replace(/\\/g, "/"))
    .map((r) => (r === "" || r === "." ? "portal" : `portal/${r}`))
    .sort();
  return [...apiRoutes, ...portalRoutes].filter((r) => {
    const seg = r.split("/")[0];
    if (GLOBAL_PREFIXES.includes(seg)) return false;
    if (fullExempt.has(r)) return false;
    return true;
  });
}

export type DriftResult = {
  routeOrphans: string[]; // routes present in code but missing from the matrix
  routeStale: string[]; // routes in the matrix but no longer in the code
  modelOrphans: string[]; // schema models with a companyId column but no matrix entry
  modelMatrixMissing: string[]; // matrix entries whose model has no companyId column and no export entry
};

function schema() {
  return fs.readFileSync(path.resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
}

/** Models whose Prisma block declares a `companyId` column. */
function modelsWithCompanyIdColumn(): string[] {
  const text = schema();
  const out: string[] = [];
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const block = m[2];
    if (/^\s*companyId\s+/m.test(block)) out.push(name);
  }
  return out;
}

/** Export-catalogue model accessors (the executable set). */
function exportModelNames(): string[] {
  const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/data-trust-export.ts"), "utf8");
  const re = /model:\s*"(\w+)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

export function runDiscovery(): DriftResult {
  const matrix = readJson<{ routes: Array<{ route: string }> }>("route_matrix.json");
  const modelMatrix = readJson<{ models: Record<string, unknown> }>("model_matrix.json");

  const detected = detectScopedRoutes();
  const matrixRoutes = new Set(matrix.routes.map((r) => r.route));
  const routeOrphans = detected.filter((r) => !matrixRoutes.has(r));
  const routeStale = [...matrixRoutes].filter((r) => !detected.includes(r));

  const withCompanyId = new Set(modelsWithCompanyIdColumn());
  const matrixModels = new Set(Object.keys(modelMatrix.models));
  const modelOrphans = [...withCompanyId].filter((m) => !matrixModels.has(m));

  const exportModels = new Set(exportModelNames());
  const modelMatrixMissing = [...matrixModels].filter((m) => !withCompanyId.has(m) && !exportModels.has(m));

  return { routeOrphans, routeStale, modelOrphans, modelMatrixMissing };
}

export function displayDrift(d: DriftResult): string {
  const lines: string[] = [];
  if (d.routeOrphans.length) lines.push(`ROUTE MATRIX DRIFT: company-scoped route(s) missing from route_matrix.json:\n  - ${d.routeOrphans.join("\n  - ")}`);
  if (d.routeStale.length) lines.push(`ROUTE MATRIX STALE: entry(ies) no longer in the codebase:\n  - ${d.routeStale.join("\n  - ")}`);
  if (d.modelOrphans.length) lines.push(`MODEL MATRIX DRIFT: model(s) with a companyId column but no model_matrix.json entry:\n  - ${d.modelOrphans.join("\n  - ")}`);
  if (d.modelMatrixMissing.length) lines.push(`MODEL MATRIX UNREFERENCED: entry(ies) with no companyId column and no export entry:\n  - ${d.modelMatrixMissing.join("\n  - ")}`);
  return lines.length ? lines.join("\n\n") : "No matrix drift detected.";
}
