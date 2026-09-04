import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { emitNotification, postCompanyWebhook } from "@/lib/notifications";

/**
 * SAMS-016 (Phase 4 Feature D) — Master Content Roll-Forward.
 *
 * Versioned content packs + the PROVIDER adopting on the client's behalf:
 *   - Master (SAMS001) publishes an IMMUTABLE, versioned ContentPack snapshot.
 *   - Operator previews the diff (added / changed / removed / conflicts) per
 *     client, then adopts → the tenant's content baseline moves to that version;
 *     the client's OWN data (assessments/findings/actions/evidence) is never
 *     touched.
 *   - Removed-but-referenced content is retained as Superseded (read-only), never
 *     hard-deleted.
 *   - Adoption is audit-logged WITH the diff attached, the client is notified
 *     (in-app + portal banner until acknowledged), and the export shows the
 *     current content version.
 *
 * STABLE CROSS-TENANT KEYS (the correlation used for diff + selective apply —
 * this is the immutable content identity that survives `runBootstrap`; the
 * tenant's row ids / rIds are deliberately re-mapped, so these are the ONLY keys
 * that match master ↔ tenant):
 *   - Standard   → `standard` (string; @@unique [standard, companyId]).
 *   - ProcessArea→ master `name`; tenant name is the bootstrap-prefixed copy
 *     (`[<companyID>] <name>`), so the tenant key is the name with the
 *     `[<…>] ` prefix stripped.
 *   - Requirement→ `requirementId` (survives bootstrap; @@unique w/ PA+company).
 *     Keyed `<paKey>:<requirementId>` for uniqueness across process areas.
 *   - Control    → `ctr:<controlRef>` when present, else `ctl:<paKey>:<name>`.
 *   - Mapping    → `map:<controlKey>:<requirementKey>` (resolved via joins).
 */

export const CONTENT_PACK_PUBLISH = "CONTENT_PACK_PUBLISH";
export const CONTENT_PACK_ADOPT = "CONTENT_PACK_ADOPT";
export const MASTER_COMPANY_ID = "SAMS001";

// ── Snapshot types ──────────────────────────────────────────────────────────
export type PackStandard = { key: string; standard: string; sequenceNo: number };
export type PackProcessArea = { key: string; name: string; description?: string | null; standard?: string | null; pId?: string | null };
export type PackRequirement = { key: string; paKey: string; requirementId: string; clauseContent: string; standard: string; pId: string; intentOutcome: string; clauseApplicability: string; references?: string | null };
export type PackControl = { key: string; paKey: string; controlRef?: string | null; name: string; statement: string; controlType: string; isHsseCritical?: boolean; ramRating?: string | null; riskWeight?: number; csfWho?: string | null; csfWhat?: string | null; csfWhen?: string | null; csfWhere?: string | null; csfWhy?: string | null; csfHow?: string | null; csfEvidence?: string | null; keyActivities?: string | null; riskAddressed?: string | null; testingApproach?: string | null; pId?: string | null; standard?: string | null };
export type PackMapping = { key: string; controlKey: string; requirementKey: string };
export type PackTemplate = { key: string; name: string; controlRefs: string[] };

export type PackContent = {
  standards: PackStandard[];
  processAreas: PackProcessArea[];
  requirements: PackRequirement[];
  controls: PackControl[];
  mappings: PackMapping[];
  templates: PackTemplate[];
};

// ── Diff representations ────────────────────────────────────────────────────
export type DiffChange = { type: "standard" | "processArea" | "requirement" | "control"; key: string };
export type DiffConflict = { type: "standard" | "processArea" | "requirement" | "control"; key: string; conflictReason: string };
export type DiffRemoval = { type: "standard" | "processArea" | "requirement" | "control" | "mapping" | "template"; key: string; superseded: boolean };

export type ContentDiff = {
  added: {
    standards: string[];
    processAreas: string[];
    requirements: string[];
    controls: string[];
    mappings: string[];
    templates: string[];
  };
  changed: DiffChange[];
  conflicts: DiffConflict[];
  removed: DiffRemoval[];
};

export type TenantContentStatus = {
  companyId: string;
  companyCode: string;
  companyName: string;
  currentVersion: number;
  availableVersion: number;
  updateAvailable: boolean;
  diff: ContentDiff | null;
};

// ── helpers ─────────────────────────────────────────────────────────────────
const stripCompanyPrefix = (name: string): string => name.replace(/^\[[^\]]*\]\s+/, "").trim();
const canonical = (o: Record<string, unknown>): string =>
  JSON.stringify(Object.keys(o).sort().reduce((acc: Record<string, unknown>, k) => { acc[k] = o[k]; return acc; }, {}));
// Content-only comparison view: drop identity bookkeeping (key/paKey) and the
// fields `runBootstrap` deliberately does NOT copy (a control's pId/standard, a
// process area's name/standard/pId), so the diff is over the content the tenant
// ACTUALLY holds — matching master↔tenant without false positives.
const contentOf = (e: Record<string, unknown>, type: string): Record<string, unknown> => {
  const { key, paKey, id, ...rest } = e;
  void key; void paKey; void id;
  if (type === "control") { const { pId, standard, ...c } = rest; void pId; void standard; return c; }
  if (type === "processArea") { const { name, standard, pId, ...c } = rest; void name; void standard; void pId; return c; }
  return rest;
};

async function requireMaster(): Promise<{ id: string }> {
  const m = await prisma.company.findUnique({ where: { companyID: MASTER_COMPANY_ID }, select: { id: true } });
  if (!m) throw new Error("SAMS001 master company not found");
  return m;
}

// ── Snapshot builder (reads SAMS001 master live content) ────────────────────
async function buildMasterSnapshot(): Promise<PackContent> {
  const master = await requireMaster();
  const mid = master.id;

  const [standards, processAreas, requirements, controls, mappings, templates, templateLinks] = await Promise.all([
    prisma.standard.findMany({ where: { companyId: mid }, orderBy: { standard: "asc" } }),
    prisma.processArea.findMany({ where: { companyId: mid }, orderBy: { name: "asc" }, include: { standardRef: true } }),
    prisma.requirement.findMany({ where: { companyId: mid }, orderBy: { requirementId: "asc" } }),
    prisma.control.findMany({ where: { companyId: mid }, orderBy: { controlRef: "asc" } }),
    prisma.mapControl2Requirement.findMany({ where: { control: { companyId: mid } }, include: { control: true, requirement: true } }),
    prisma.assessmentTemplate.findMany({ where: { companyId: mid }, orderBy: { name: "asc" } }),
    prisma.assessmentTemplateControlLinkage.findMany({ where: { template: { companyId: mid } }, include: { template: true, control: true } }),
  ]);

  const paKeyByPaId = new Map<string, string>();
  for (const pa of processAreas) paKeyByPaId.set(pa.id, pa.name);
  const ctrlKeyByCid = new Map<string, string>();
  for (const c of controls) ctrlKeyByCid.set(c.id, c.controlRef ? `ctr:${c.controlRef}` : `ctl:${paKeyByPaId.get(c.processAreaId ?? "") ?? "?"}:${c.name}`);
  const reqKeyByRid = new Map<number, string>();
  for (const r of requirements) reqKeyByRid.set(r.rId, `${paKeyByPaId.get(r.processAreaId ?? "") ?? "?"}:${r.requirementId}`);
  const stdKeyByStd = new Map<string, string>();
  for (const s of standards) stdKeyByStd.set(s.id, s.standard);

  const snap: PackContent = {
    standards: standards.map((s) => ({ key: s.standard, standard: s.standard, sequenceNo: s.sequenceNo })),
    processAreas: processAreas.map((pa) => ({ key: pa.name, name: pa.name, description: pa.description, standard: pa.standard ?? pa.standardRef?.standard ?? null, pId: pa.pId })),
    requirements: requirements.map((r) => ({
      key: reqKeyByRid.get(r.rId) ?? `${paKeyByPaId.get(r.processAreaId ?? "") ?? "?"}:${r.requirementId}`,
      paKey: paKeyByPaId.get(r.processAreaId ?? "") ?? "?",
      requirementId: r.requirementId,
      clauseContent: r.clauseContent,
      standard: r.standard,
      pId: r.pId,
      intentOutcome: r.intentOutcome,
      clauseApplicability: r.clauseApplicability,
      references: r.references,
    })),
    controls: controls.map((c) => ({
      key: ctrlKeyByCid.get(c.id) ?? `ctl:${paKeyByPaId.get(c.processAreaId ?? "") ?? "?"}:${c.name}`,
      paKey: paKeyByPaId.get(c.processAreaId ?? "") ?? "?",
      controlRef: c.controlRef,
      name: c.name,
      statement: c.statement,
      controlType: c.controlType,
      isHsseCritical: c.isHsseCritical,
      ramRating: c.ramRating,
      riskWeight: c.riskWeight,
      csfWho: c.csfWho, csfWhat: c.csfWhat, csfWhen: c.csfWhen,
      csfWhere: c.csfWhere, csfWhy: c.csfWhy, csfHow: c.csfHow,
      csfEvidence: c.csfEvidence,
      keyActivities: c.keyActivities,
      riskAddressed: c.riskAddressed,
      testingApproach: c.testingApproach,
      pId: c.pId,
      standard: c.standard,
    })),
    mappings: mappings
      .filter((m) => ctrlKeyByCid.has(m.controlId) && reqKeyByRid.has(m.requirementRId))
      .map((m) => ({
        key: `map:${ctrlKeyByCid.get(m.controlId)}:${reqKeyByRid.get(m.requirementRId)}`,
        controlKey: ctrlKeyByCid.get(m.controlId) ?? "",
        requirementKey: reqKeyByRid.get(m.requirementRId) ?? "",
      })),
    templates: templates.map((t) => ({
      key: t.name,
      name: t.name,
      controlRefs: templateLinks.filter((l) => l.templateId === t.id).map((l) => ctrlKeyByCid.get(l.controlId) ?? l.control.controlRef ?? l.control.name),
    })),
  };
  return snap;
}

// ── Publish ─────────────────────────────────────────────────────────────────
export async function publishContentPack(opts: { fromVersion?: number; publishedById?: string | null }): Promise<{ packId: string; version: number }> {
  const master = await requireMaster();
  const latest = await prisma.contentPack.findFirst({
    where: { companyId: master.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const latestVersion = latest?.version ?? 0;
  if (opts.fromVersion != null && opts.fromVersion !== latestVersion) {
    throw new Error(`Concurrent publish: latest published version is ${latestVersion}, expected ${opts.fromVersion}`);
  }
  const version = latestVersion + 1;
  const snapshot = await buildMasterSnapshot();
  const created = await prisma.contentPack.create({
    data: { version, companyId: master.id, snapshot: snapshot as unknown as object, publishedById: opts.publishedById ?? null },
    select: { id: true, version: true },
  });
  await logActivity({
    activityType: CONTENT_PACK_PUBLISH,
    description: `Master published immutable content pack v${version}`,
    username: opts.publishedById ?? "provider",
    refTable: "ContentPack",
    refRecord: created.id,
    afterData: { version },
  });
  return { packId: created.id, version };
}

// ── Tenant-side content reading + correlation ──────────────────────────────
type TenantContent = {
  standards: Map<string, { id: string; standard: string; sequenceNo: number }>;
  processAreas: Map<string, { id: string; name: string; description?: string | null; standard?: string | null; pId?: string | null }>;
  requirements: Map<string, { id: number; paKey: string; requirementId: string; clauseContent: string; standard: string; pId: string; intentOutcome: string; clauseApplicability: string; references?: string | null }>;
  controls: Map<string, { id: string; paKey: string; controlRef?: string | null; name: string; statement: string; controlType: string; isHsseCritical?: boolean; ramRating?: string | null; riskWeight?: number; csfWho?: string | null; csfWhat?: string | null; csfWhen?: string | null; csfWhere?: string | null; csfWhy?: string | null; csfHow?: string | null; csfEvidence?: string | null; keyActivities?: string | null; riskAddressed?: string | null; testingApproach?: string | null; pId?: string | null; standard?: string | null }>;
  mappings: Map<string, { controlKey: string; requirementKey: string }>;
};

async function readTenantContent(companyId: string): Promise<TenantContent> {
  const [standards, processAreas, requirements, controls, mappings] = await Promise.all([
    prisma.standard.findMany({ where: { companyId } }),
    prisma.processArea.findMany({ where: { companyId }, include: { standardRef: true } }),
    prisma.requirement.findMany({ where: { companyId }, include: { processArea: true } }),
    prisma.control.findMany({ where: { companyId }, include: { processArea: true } }),
    prisma.mapControl2Requirement.findMany({ where: { control: { companyId } }, include: { control: true, requirement: true } }),
  ]);

  const paKeyByCid = new Map<string, string>();
  for (const pa of processAreas) paKeyByCid.set(pa.id, stripCompanyPrefix(pa.name));

  const stdMap = new Map<string, { id: string; standard: string; sequenceNo: number }>();
  for (const s of standards) stdMap.set(s.standard, { id: s.id, standard: s.standard, sequenceNo: s.sequenceNo });

  const paMap = new Map<string, { id: string; name: string; description?: string | null; standard?: string | null; pId?: string | null }>();
  for (const pa of processAreas) paMap.set(stripCompanyPrefix(pa.name), { id: pa.id, name: pa.name, description: pa.description, standard: pa.standard ?? pa.standardRef?.standard ?? null, pId: pa.pId });

  const reqMap = new Map<string, { id: number; paKey: string; requirementId: string; clauseContent: string; standard: string; pId: string; intentOutcome: string; clauseApplicability: string; references?: string | null }>();
  for (const r of requirements) {
    const paKey = paKeyByCid.get(r.processAreaId ?? "") ?? "?";
    reqMap.set(`${paKey}:${r.requirementId}`, { id: r.rId, paKey, requirementId: r.requirementId, clauseContent: r.clauseContent, standard: r.standard, pId: r.pId, intentOutcome: r.intentOutcome, clauseApplicability: r.clauseApplicability, references: r.references });
  }

  const ctrlMap = new Map<string, { id: string; paKey: string; controlRef?: string | null; name: string; statement: string; controlType: string; isHsseCritical?: boolean; ramRating?: string | null; riskWeight?: number; csfWho?: string | null; csfWhat?: string | null; csfWhen?: string | null; csfWhere?: string | null; csfWhy?: string | null; csfHow?: string | null; csfEvidence?: string | null; keyActivities?: string | null; riskAddressed?: string | null; testingApproach?: string | null; pId?: string | null; standard?: string | null }>();
  for (const c of controls) {
    const paKey = paKeyByCid.get(c.processAreaId ?? "") ?? "?";
    const key = c.controlRef ? `ctr:${c.controlRef}` : `ctl:${paKey}:${c.name}`;
    ctrlMap.set(key, { id: c.id, paKey, controlRef: c.controlRef, name: c.name, statement: c.statement, controlType: c.controlType, isHsseCritical: c.isHsseCritical, ramRating: c.ramRating, riskWeight: c.riskWeight, csfWho: c.csfWho, csfWhat: c.csfWhat, csfWhen: c.csfWhen, csfWhere: c.csfWhere, csfWhy: c.csfWhy, csfHow: c.csfHow, csfEvidence: c.csfEvidence, keyActivities: c.keyActivities, riskAddressed: c.riskAddressed, testingApproach: c.testingApproach, pId: c.pId, standard: c.standard });
  }

  const mapMap = new Map<string, { controlKey: string; requirementKey: string }>();
  for (const m of mappings) {
    const ckey = m.control.controlRef ? `ctr:${m.control.controlRef}` : `ctl:${paKeyByCid.get(m.control.processAreaId ?? "") ?? "?"}:${m.control.name}`;
    const rkey = `${paKeyByCid.get(m.requirement.processAreaId ?? "") ?? "?"}:${m.requirement.requirementId}`;
    mapMap.set(`map:${ckey}:${rkey}`, { controlKey: ckey, requirementKey: rkey });
  }

  return { standards: stdMap, processAreas: paMap, requirements: reqMap, controls: ctrlMap, mappings: mapMap };
}

function toPackMaps(content: PackContent) {
  return {
    standards: new Map(content.standards.map((s) => [s.key, s])),
    processAreas: new Map(content.processAreas.map((p) => [p.key, p])),
    requirements: new Map(content.requirements.map((r) => [r.key, r])),
    controls: new Map(content.controls.map((c) => [c.key, c])),
    mappings: new Map(content.mappings.map((m) => [m.key, m])),
    templates: new Map(content.templates.map((t) => [t.key, t])),
  };
}

function toRecordMaps<T extends { key: string }>(arr: T[]): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  for (const e of arr) m.set(e.key, e as unknown as Record<string, unknown>);
  return m;
}

// ── Diff computation ────────────────────────────────────────────────────────
type ClassifyCtx = {
  addedTargets: string[];
  changed: DiffChange[];
  conflicts: DiffConflict[];
  removed: DiffRemoval[];
};

function classifyEntities(
  type: "standard" | "processArea" | "requirement" | "control",
  newByKey: Map<string, Record<string, unknown>>,
  priorByKey: Map<string, Record<string, unknown>> | null,
  tenantByKey: Map<string, Record<string, unknown>>,
  ctx: ClassifyCtx
) {
  const priorKeys = new Set(priorByKey?.keys() ?? []);
  const newKeys = new Set(newByKey.keys());
  for (const key of newKeys) {
    if (!priorKeys.has(key)) ctx.addedTargets.push(key);
  }
  for (const key of priorKeys) {
    if (!newKeys.has(key) && tenantByKey.has(key)) ctx.removed.push({ type, key, superseded: true });
  }
  for (const key of newKeys) {
    if (!priorKeys.has(key)) continue;
    const newer = newByKey.get(key)!;
    const older = priorByKey!.get(key)!;
    const tenantRow = tenantByKey.get(key);
    if (canonical(contentOf(newer, type)) === canonical(contentOf(older, type))) continue; // unchanged
    if (tenantRow && canonical(contentOf(tenantRow, type)) !== canonical(contentOf(older, type))) {
      ctx.conflicts.push({ type, key, conflictReason: "changed-elsewhere" });
    } else {
      ctx.changed.push({ type, key });
    }
  }
}

export async function computeContentDiff(targetCompanyId: string): Promise<TenantContentStatus> {
  const master = await requireMaster();
  const state = await prisma.companyContentState.findUnique({ where: { companyId: targetCompanyId } });
  const currentVersion = state?.contentVersion ?? 1;
  const latestPack = await prisma.contentPack.findFirst({
    where: { companyId: master.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, snapshot: true },
  });
  const company = await prisma.company.findUnique({ where: { id: targetCompanyId }, select: { companyID: true, companyName: true } });
  if (!latestPack || latestPack.version <= currentVersion) {
    return { companyId: targetCompanyId, companyCode: company?.companyID ?? "", companyName: company?.companyName ?? "", currentVersion, availableVersion: latestPack?.version ?? 0, updateAvailable: false, diff: null };
  }

  const newContent = latestPack.snapshot as unknown as PackContent;
  const priorPack = await prisma.contentPack.findUnique({ where: { companyId_version: { companyId: master.id, version: currentVersion } } });
  const priorContent = priorPack ? (priorPack.snapshot as unknown as PackContent) : null;

  const tenant = await readTenantContent(targetCompanyId);
  const newMaps = toPackMaps(newContent);
  const tenantAsRecordMaps: Record<string, Map<string, Record<string, unknown>>> = {
    standard: tenant.standards as unknown as Map<string, Record<string, unknown>>,
    processArea: tenant.processAreas as unknown as Map<string, Record<string, unknown>>,
    requirement: tenant.requirements as unknown as Map<string, Record<string, unknown>>,
    control: tenant.controls as unknown as Map<string, Record<string, unknown>>,
  };

  const ctx: ClassifyCtx = { addedTargets: [], changed: [], conflicts: [], removed: [] };
  const added: ContentDiff["added"] = { standards: [], processAreas: [], requirements: [], controls: [], mappings: [], templates: [] };

  classifyEntities("standard", toRecordMaps(newContent.standards), priorContent ? toRecordMaps(priorContent.standards) : null, tenantAsRecordMaps.standard, ctx);
  classifyEntities("processArea", toRecordMaps(newContent.processAreas), priorContent ? toRecordMaps(priorContent.processAreas) : null, tenantAsRecordMaps.processArea, ctx);
  classifyEntities("requirement", toRecordMaps(newContent.requirements), priorContent ? toRecordMaps(priorContent.requirements) : null, tenantAsRecordMaps.requirement, ctx);
  classifyEntities("control", toRecordMaps(newContent.controls), priorContent ? toRecordMaps(priorContent.controls) : null, tenantAsRecordMaps.control, ctx);

  // Deterministic `added`/`removed` derivation (new-vs-prior, independent of the
  // classifier's internal ordering).
  added.standards = diffAdded(newContent.standards.map((s) => s.key), priorContent?.standards.map((s) => s.key) ?? []);
  added.processAreas = diffAdded(newContent.processAreas.map((p) => p.key), priorContent?.processAreas.map((p) => p.key) ?? []);
  added.requirements = diffAdded(newContent.requirements.map((r) => r.key), priorContent?.requirements.map((r) => r.key) ?? []);
  added.controls = diffAdded(newContent.controls.map((c) => c.key), priorContent?.controls.map((c) => c.key) ?? []);
  for (const key of newContent.mappings.map((m) => m.key)) if (!(priorContent?.mappings.some((m) => m.key === key) ?? false)) added.mappings.push(key);
  for (const key of newContent.templates.map((t) => t.key)) if (!(priorContent?.templates.some((t) => t.key === key) ?? false)) added.templates.push(key);

  const removed: DiffRemoval[] = [...ctx.removed];
  for (const key of (priorContent?.mappings.map((m) => m.key) ?? [])) if (!newContent.mappings.some((m) => m.key === key) && tenant.mappings.has(key)) removed.push({ type: "mapping", key, superseded: false });

  return {
    companyId: targetCompanyId,
    companyCode: company?.companyID ?? "",
    companyName: company?.companyName ?? "",
    currentVersion,
    availableVersion: latestPack.version,
    updateAvailable: true,
    diff: { added, changed: ctx.changed, conflicts: ctx.conflicts, removed },
  };
}

function diffAdded(newKeys: string[], priorKeys: string[]): string[] {
  const prior = new Set(priorKeys);
  return newKeys.filter((k) => !prior.has(k));
}

// ── Adopt ───────────────────────────────────────────────────────────────────
export type AdoptResult = {
  adopted: boolean;
  contentVersion: number;
  diff: ContentDiff;
  beforeChecksum: string;
  afterChecksum: string;
};

/** Client-data tables the adopt path must NEVER mutate (the sacred record). */
const CLIENT_TABLES = ["audits", "findings", "actions", "evidence", "conclusions", "controlAssignments"] as const;

async function checksumClientData(companyId: string): Promise<string> {
  const [audits, findings, actions, evidence, conclusions, assignments] = await Promise.all([
    prisma.assessment.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.finding.findMany({ where: { assessment: { companyId } }, orderBy: { id: "asc" } }),
    prisma.action.findMany({ where: { finding: { assessment: { companyId } } }, orderBy: { id: "asc" } }),
    prisma.attachment.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.requirementConclusion.findMany({ where: { assessment: { companyId } }, orderBy: { id: "asc" } }),
    prisma.controlAssignment.findMany({ where: { assessment: { companyId } }, orderBy: { id: "asc" } }),
  ]);
  const norm = (rows: Array<Record<string, unknown>>) => rows.map((r) => canonical(r));
  return JSON.stringify({
    audits: norm(audits as unknown as Array<Record<string, unknown>>),
    findings: norm(findings as unknown as Array<Record<string, unknown>>),
    actions: norm(actions as unknown as Array<Record<string, unknown>>),
    evidence: norm(evidence as unknown as Array<Record<string, unknown>>),
    conclusions: norm(conclusions as unknown as Array<Record<string, unknown>>),
    controlAssignments: norm(assignments as unknown as Array<Record<string, unknown>>),
  });
}

function changedLabel(diff: ContentDiff): string {
  const added = diff.added.standards.length + diff.added.processAreas.length + diff.added.requirements.length + diff.added.controls.length + diff.added.mappings.length;
  return `${added} added · ${diff.changed.length} changed · ${diff.conflicts.length} conflict · ${diff.removed.length} removed`;
}

async function latestMasterPack(version: number): Promise<{ id: string; snapshot: unknown }> {
  const master = await requireMaster();
  const p = await prisma.contentPack.findUnique({ where: { companyId_version: { companyId: master.id, version } } });
  if (!p) throw new Error(`ContentPack v${version} not found`);
  return { id: p.id, snapshot: p.snapshot };
}

async function nextRid(companyId: string): Promise<number> {
  const max = await prisma.requirement.aggregate({ where: { companyId }, _max: { rId: true } });
  return (max._max.rId ?? 0) + 1;
}

async function resolveControlId(key: string, companyId: string): Promise<string | null> {
  let ref = key.replace(/^ctr:/, "");
  if (key.startsWith("ctl:")) ref = key.split(":").pop() ?? ref;
  const ctrl = await prisma.control.findFirst({ where: { companyId, OR: [{ controlRef: ref }, { name: ref }] }, select: { id: true } });
  return ctrl?.id ?? null;
}
async function resolveRequirementId(key: string, companyId: string): Promise<number | null> {
  const ref = key.includes(":") ? key.split(":").slice(1).join(":") : key;
  const req = await prisma.requirement.findFirst({ where: { companyId, requirementId: ref }, select: { rId: true } });
  return req?.rId ?? null;
}

export async function adoptContentPack(opts: { companyId: string; toVersion: number; dryRun?: boolean; adoptedByUserId?: string | null }): Promise<AdoptResult> {
  const company = await prisma.company.findUnique({ where: { id: opts.companyId }, select: { id: true, companyID: true, companyName: true } });
  if (!company) throw new Error("Company not found");
  if (company.companyID === MASTER_COMPANY_ID) throw new Error("Cannot adopt on the master company");

  const target = await latestMasterPack(opts.toVersion);
  const newContent = target.snapshot as unknown as PackContent;
  const currentState = await prisma.companyContentState.findUnique({ where: { companyId: opts.companyId } });
  const currentVersion = currentState?.contentVersion ?? 1;

  const beforeChecksum = await checksumClientData(opts.companyId);
  const status = await computeContentDiff(opts.companyId);
  if (!status.diff) throw new Error("No update available to adopt");
  const diff = status.diff;

  if (opts.dryRun) {
    return { adopted: false, contentVersion: currentVersion, diff, beforeChecksum, afterChecksum: beforeChecksum };
  }

  const prefix = `[${company.companyID}] `;
  const now = new Date();
  const tenant = await readTenantContent(opts.companyId);
  const newMaps = toPackMaps(newContent);

  // ── 1. ADDED (selective apply by stable key; never wipe-and-reload) ──
  for (const key of diff.added.standards) {
    const std = newMaps.standards.get(key);
    if (!std || tenant.standards.has(key)) continue;
    await prisma.standard.create({ data: { standard: std.standard, sequenceNo: std.sequenceNo, companyId: opts.companyId } });
  }
  const tenantStandards = await prisma.standard.findMany({ where: { companyId: opts.companyId } });
  const stdIdByKey = new Map(tenantStandards.map((s) => [s.standard, s.id]));
  const paIdByKey = new Map<string, string>();
  for (const pa of await prisma.processArea.findMany({ where: { companyId: opts.companyId } })) paIdByKey.set(stripCompanyPrefix(pa.name), pa.id);

  for (const key of diff.added.processAreas) {
    const pa = newMaps.processAreas.get(key);
    if (!pa || paIdByKey.has(key)) continue;
    const stdId = pa.standard ? stdIdByKey.get(pa.standard) ?? null : null;
    const created = await prisma.processArea.create({ data: { name: `${prefix}${pa.name}`, description: pa.description ?? null, standardId: stdId, companyId: opts.companyId } });
    paIdByKey.set(key, created.id);
  }

  let rid = await nextRid(opts.companyId);
  const reqIdByKey = new Map<string, number>();
  for (const key of diff.added.requirements) {
    const req = newMaps.requirements.get(key);
    if (!req || tenant.requirements.has(key) || reqIdByKey.has(key)) continue;
    const paId = req.paKey ? (paIdByKey.get(req.paKey) ?? null) : null;
    if (!paId) continue;
    const rId = rid++;
    await prisma.requirement.create({ data: { rId, requirementId: req.requirementId, clauseContent: req.clauseContent, standard: req.standard, pId: req.pId, intentOutcome: req.intentOutcome, clauseApplicability: req.clauseApplicability, references: req.references ?? null, processAreaId: paId, companyId: opts.companyId } });
    reqIdByKey.set(key, rId);
  }
  for (const r of await prisma.requirement.findMany({ where: { companyId: opts.companyId }, include: { processArea: true } })) reqIdByKey.set(`${stripCompanyPrefix(r.processArea?.name ?? "")}:${r.requirementId}`, r.rId);

  const ctrlIdByKey = new Map<string, string>();
  for (const key of diff.added.controls) {
    const c = newMaps.controls.get(key);
    if (!c || tenant.controls.has(key) || ctrlIdByKey.has(key)) continue;
    const paId = c.paKey ? (paIdByKey.get(c.paKey) ?? null) : null;
    const created = await prisma.control.create({ data: { name: c.name, statement: c.statement, controlType: c.controlType as never, processAreaId: paId, companyId: opts.companyId, isHsseCritical: c.isHsseCritical ?? false, ramRating: c.ramRating ?? null, riskWeight: c.riskWeight ?? 1, controlRef: c.controlRef ?? null, csfWho: c.csfWho ?? null, csfWhat: c.csfWhat ?? null, csfWhen: c.csfWhen ?? null, csfWhere: c.csfWhere ?? null, csfWhy: c.csfWhy ?? null, csfHow: c.csfHow ?? null, csfEvidence: c.csfEvidence ?? null, keyActivities: c.keyActivities ?? null, riskAddressed: c.riskAddressed ?? null, testingApproach: c.testingApproach ?? null, pId: c.pId ?? null, standard: c.standard ?? null } });
    ctrlIdByKey.set(key, created.id);
  }
  for (const c of await prisma.control.findMany({ where: { companyId: opts.companyId }, include: { processArea: true } })) ctrlIdByKey.set(c.controlRef ? `ctr:${c.controlRef}` : `ctl:${stripCompanyPrefix(c.processArea?.name ?? "")}:${c.name}`, c.id);

  for (const key of diff.added.mappings) {
    const m = newMaps.mappings.get(key);
    if (!m || tenant.mappings.has(key)) continue;
    const cid = ctrlIdByKey.get(m.controlKey) ?? await resolveControlId(m.controlKey, opts.companyId);
    const rir = reqIdByKey.get(m.requirementKey) ?? await resolveRequirementId(m.requirementKey, opts.companyId);
    if (!cid || !rir) continue;
    await prisma.mapControl2Requirement.create({ data: { controlId: cid, requirementRId: rir } }).catch(() => null);
  }
  for (const key of diff.added.templates) {
    const t = newMaps.templates.get(key);
    if (!t) continue;
    const existing = await prisma.assessmentTemplate.findFirst({ where: { name: t.name, companyId: opts.companyId } });
    if (existing) continue;
    const tpl = await prisma.assessmentTemplate.create({ data: { name: t.name, companyId: opts.companyId } });
    for (const ref of t.controlRefs) {
      const cid = ctrlIdByKey.get(ref) ?? await resolveControlId(ref, opts.companyId);
      if (cid) await prisma.assessmentTemplateControlLinkage.create({ data: { templateId: tpl.id, controlId: cid } }).catch(() => null);
    }
  }

  // ── 2. CHANGED (ordinary) — apply new content values ──
  for (const ch of diff.changed) {
    if (ch.type === "standard") { const s = newMaps.standards.get(ch.key); const t = tenant.standards.get(ch.key); if (s && t) await prisma.standard.update({ where: { id: t.id }, data: { standard: s.standard, sequenceNo: s.sequenceNo } }); }
    if (ch.type === "processArea") { const s = newMaps.processAreas.get(ch.key); const t = tenant.processAreas.get(ch.key); if (s && t) await prisma.processArea.update({ where: { id: t.id }, data: { description: s.description ?? null } }); }
    if (ch.type === "requirement") { const s = newMaps.requirements.get(ch.key); const t = tenant.requirements.get(ch.key); if (s && t) await prisma.requirement.update({ where: { rId: t.id }, data: { clauseContent: s.clauseContent, intentOutcome: s.intentOutcome, clauseApplicability: s.clauseApplicability, references: s.references ?? null } }); }
    if (ch.type === "control") { const s = newMaps.controls.get(ch.key); const t = tenant.controls.get(ch.key); if (s && t) await prisma.control.update({ where: { id: t.id }, data: { name: s.name, statement: s.statement, controlType: s.controlType as never, isHsseCritical: s.isHsseCritical ?? false, ramRating: s.ramRating ?? null, riskWeight: s.riskWeight ?? 1, csfWho: s.csfWho ?? null, csfWhat: s.csfWhat ?? null, csfWhen: s.csfWhen ?? null, csfWhere: s.csfWhere ?? null, csfWhy: s.csfWhy ?? null, csfHow: s.csfHow ?? null, csfEvidence: s.csfEvidence ?? null, keyActivities: s.keyActivities ?? null, riskAddressed: s.riskAddressed ?? null, testingApproach: s.testingApproach ?? null, pId: s.pId ?? null, standard: s.standard ?? null } }); }
  }

  // ── 3. CHANGED (conflict) — apply the master version; the audit entry carries the flag ──
  for (const c of diff.conflicts) {
    if (c.type === "control") { const s = newMaps.controls.get(c.key); const t = tenant.controls.get(c.key); if (s && t) await prisma.control.update({ where: { id: t.id }, data: { statement: s.statement, name: s.name, controlType: s.controlType as never, csfWho: s.csfWho ?? null, csfWhat: s.csfWhat ?? null } }); }
    if (c.type === "standard") { const s = newMaps.standards.get(c.key); const t = tenant.standards.get(c.key); if (s && t) await prisma.standard.update({ where: { id: t.id }, data: { standard: s.standard, sequenceNo: s.sequenceNo } }); }
    if (c.type === "requirement") { const s = newMaps.requirements.get(c.key); const t = tenant.requirements.get(c.key); if (s && t) await prisma.requirement.update({ where: { rId: t.id }, data: { clauseContent: s.clauseContent } }); }
    if (c.type === "processArea") { const s = newMaps.processAreas.get(c.key); const t = tenant.processAreas.get(c.key); if (s && t) await prisma.processArea.update({ where: { id: t.id }, data: { description: s.description ?? null } }); }
  }

  // ── 4. REMOVED — supersede (never hard-delete referenced content) ──
  for (const r of diff.removed) {
    if (r.type === "control") { const t = tenant.controls.get(r.key); if (t) await prisma.control.update({ where: { id: t.id }, data: { contentStatus: "Superseded", supersededAt: now } }); }
    if (r.type === "standard") { const t = tenant.standards.get(r.key); if (t) await prisma.standard.update({ where: { id: t.id }, data: { contentStatus: "Superseded", supersededAt: now } }); }
    if (r.type === "processArea") { const t = tenant.processAreas.get(r.key); if (t) await prisma.processArea.update({ where: { id: t.id }, data: { contentStatus: "Superseded", supersededAt: now } }); }
    if (r.type === "requirement") { const t = tenant.requirements.get(r.key); if (t) await prisma.requirement.update({ where: { rId: t.id }, data: { contentStatus: "Superseded", supersededAt: now } }); }
    if (r.type === "mapping") {
      // Junctions are content links (not client data): drop ONLY the stale link
      // (never a blanket wipe — that would delete unrelated tenant mappings).
      const tm = tenant.mappings.get(r.key);
      if (tm) {
        const cid = await resolveControlId(tm.controlKey, opts.companyId);
        const rid = await resolveRequirementId(tm.requirementKey, opts.companyId);
        if (cid && rid) await prisma.mapControl2Requirement.deleteMany({ where: { controlId: cid, requirementRId: rid } });
      }
    }
  }

  // ── 5. Update tenant content state ──
  await prisma.companyContentState.upsert({
    where: { companyId: opts.companyId },
    create: { companyId: opts.companyId, contentVersion: opts.toVersion, lastPackId: target.id, lastAdoptedAt: now, acknowledgedContentVersion: currentVersion },
    update: { contentVersion: opts.toVersion, lastPackId: target.id, lastAdoptedAt: now },
  });

  const afterChecksum = await checksumClientData(opts.companyId);

  // ── 6. Audit log WITH the diff attached ──
  await logActivity({
    activityType: CONTENT_PACK_ADOPT,
    description: `Provider adopted content pack v${currentVersion}→v${opts.toVersion} on ${company.companyName} (${company.companyID})`,
    username: opts.adoptedByUserId ?? "provider",
    refTable: "CompanyContentState",
    refRecord: company.id,
    beforeData: { contentVersion: currentVersion },
    afterData: { contentVersion: opts.toVersion, diff, conflicts: diff.conflicts, clientDataChecksumMatch: beforeChecksum === afterChecksum },
  });

  // ── 7. Notify the client's monitors (in-app + webhook) ──
  const monitors = await prisma.user.findMany({
    where: { active: true, role: { in: ["Admin", "Superuser", "Assessor"] }, OR: [{ companyId: opts.companyId }, { userCompanies: { some: { companyId: opts.companyId } } }] },
    select: { id: true },
  });
  for (const u of monitors) {
    await emitNotification({
      recipientUserId: u.id,
      type: "ContentBaselineUpdated",
      entityType: "Company",
      entityId: company.id,
      title: `Content baseline updated v${currentVersion}→v${opts.toVersion}`,
      body: changedLabel(diff),
      companyId: opts.companyId,
    });
  }
  await postCompanyWebhook({
    companyId: opts.companyId,
    text: `📦 Content baseline updated v${currentVersion}→v${opts.toVersion} — ${changedLabel(diff)}`,
  });

  return { adopted: true, contentVersion: opts.toVersion, diff, beforeChecksum, afterChecksum };
}

// ── Operator per-company status list ────────────────────────────────────────
export async function getOperatorContentStatus(): Promise<TenantContentStatus[]> {
  // The operator console lists CLIENTS. The master (SAMS001) is the publisher —
  // it must never appear as a tenant with an adoptable "update available", so we
  // exclude it from the content-status list explicitly.
  const companies = await prisma.company.findMany({
    where: { companyID: { not: MASTER_COMPANY_ID } },
    orderBy: { companyID: "asc" },
    select: { id: true },
  });
  const out: TenantContentStatus[] = [];
  for (const c of companies) out.push(await computeContentDiff(c.id));
  return out;
}

// ── Client banner ───────────────────────────────────────────────────────────
export async function getClientContentBanner(companyId: string): Promise<{ show: boolean; currentVersion: number; acknowledgedVersion: number | null; diff: ContentDiff | null; updateAvailable: boolean }> {
  const state = await prisma.companyContentState.findUnique({ where: { companyId } });
  const currentVersion = state?.contentVersion ?? 1;
  const acknowledged = state?.acknowledgedContentVersion ?? null;
  // The banner is a NOTICE of an APPLIED change: show when the current baseline
  // version is newer than the acknowledged one (or never acknowledged).
  const show = currentVersion > 1 && (acknowledged == null || acknowledged < currentVersion);
  if (!show) return { show, currentVersion, acknowledgedVersion: acknowledged, diff: null, updateAvailable: false };
  // There may be no *pending* update (the client already adopted the latest), so
  // the "what changed" summary must come from the change that was just APPLIED —
  // i.e. the latest adoption audit entry (its diff deep-equals the operator's
  // preview, so the banner shows exactly what was adopted). Fall back to the
  // pending diff if there's a still-newer pack available.
  const applied = await prisma.activityLog.findFirst({
    where: { refRecord: companyId, activityType: CONTENT_PACK_ADOPT },
    orderBy: { createdAt: "desc" },
    select: { afterData: true },
  });
  const appliedDiff = (applied?.afterData as { diff?: ContentDiff } | null | undefined)?.diff ?? null;
  const status = await computeContentDiff(companyId);
  return { show, currentVersion, acknowledgedVersion: acknowledged, diff: appliedDiff ?? status.diff, updateAvailable: status.updateAvailable };
}

export async function acknowledgeContentBanner(companyId: string): Promise<{ acknowledged: boolean; contentVersion: number }> {
  const state = await prisma.companyContentState.findUnique({ where: { companyId } });
  const currentVersion = state?.contentVersion ?? 1;
  await prisma.companyContentState.upsert({
    where: { companyId },
    create: { companyId, contentVersion: currentVersion, acknowledgedContentVersion: currentVersion },
    update: { acknowledgedContentVersion: currentVersion },
  });
  return { acknowledged: true, contentVersion: currentVersion };
}
