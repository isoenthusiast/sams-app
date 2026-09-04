import { prisma } from "@/lib/prisma";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

/**
 * SAMS-015 — Tamper-Evident Audit Trail (Phase 4, Feature C).
 *
 * The ActivityLog is a **global** log by design (see docs/ISOLATION_MODEL.md).
 * SAMS-015 adds a PER-COMPANY hash chain so a company can verify its own trail
 * (and hold an independent weekly anchor) without touching another tenant's
 * rows. To make the chain per-company we need a per-row company discriminator,
 * so ActivityLog gained two additive nullable columns:
 *   - `companyId`  — the owning company (null for global/operator rows → chainless)
 *   - `chainHash`  — sha256(prevChainHash ‖ canonical-field-set)
 *
 * THIS MODULE is the single source of truth for the canonicalization, the chain
 * computation, the per-company head read, the chained write, and the verifier.
 * It is used identically by:
 *   - every ACTIVITYLOG WRITE PATH (via createChainedActivityLog) — see the
 *     write-path surface in the SAMS-015 docs note,
 *   - the SAMS-015 BACKFILL migration (scripts/db/migrations/20260904_add_audit_chain.ts),
 *   - the VERIFY CLI (scripts/verify-audit-chain.ts),
 *   - the WEEKLY DIGEST anchor (getChainHeadHash → runWeeklyDigest).
 *
 * ── Pinned canonical form (Conan condition #2) ────────────────────────────
 *   field set = id, timestamp, description, activityType, username, refTable,
 *               refRecord, beforeData, afterData, companyId
 *   JSON fields (beforeData/afterData) are canonicalized with sorted keys and a
 *   stable stringify. The separator is U+2016 (‖), per spec
 *   `chainHash = sha256(prevChainHash ‖ canonical row fields)`.
 *
 * ── Pinned ordering (Conan condition #3) ──────────────────────────────────
 *   (createdAt, id), ascending, identical in writer, backfill and verifier.
 *
 * ── Concurrency (Conan condition #4) ──────────────────────────────────────
 *   The chain-write runs in a single transaction that first takes a per-company
 *   Postgres advisory xact lock (`pg_advisory_xact_lock(hashtext(companyId))`)
 *   so concurrent writes to the same company's chain serialize (this also covers
 *   the EMPTY-CHAIN first write — when no head row exists yet, FOR UPDATE would
 *   lock nothing, so the advisory lock is what prevents two rows both claiming
 *   prevChainHash=""). The head row is additionally read `FOR UPDATE`.
 */

const SEP = "\u2016";

export interface ChainRowFields {
  id: string;
  timestamp: Date;
  description: string;
  activityType: string;
  username: string;
  refTable: string | null;
  refRecord: string | null;
  beforeData: unknown;
  afterData: unknown;
  companyId: string | null;
}

/** One ActivityLog write (the SAMS-015 write surface). */
export interface ActivityLogChainEntry {
  activityType: string;
  description: string;
  username: string;
  refTable?: string | null;
  refRecord?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  /** Optional hint. When omitted, resolved from refTable/refRecord (same logic as backfill). */
  companyId?: string | null;
}

/** Deterministic JSON serialization (recursive, sorted object keys). */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** The canonical string for a row (pinned field set, sorted-JSON canonicalization). */
export function canonicalizeRow(f: ChainRowFields): string {
  return [
    f.id,
    f.timestamp.toISOString(),
    f.description,
    f.activityType,
    f.username,
    f.refTable ?? "",
    f.refRecord ?? "",
    stableStringify(f.beforeData),
    stableStringify(f.afterData),
    f.companyId ?? "",
  ].join(SEP);
}

/**
 * chainHash = sha256(prevChainHash ‖ canonical). The canonical string is passed
 * in so writer / backfill / verifier all hit the exact same code path.
 */
export function computeChainHash(prevChainHash: string, canonical: string): string {
  return sha256(`${prevChainHash}${SEP}${canonical}`);
}

/**
 * Resolve the owning company of an ActivityLog row from its refTable/refRecord.
 * Returns null when the row cannot be resolved (no refRecord, unknown refTable,
 * or the referenced row no longer exists) → such rows are CHAINLESS (global /
 * operator events, per Conan condition #1).
 */
export async function resolveCompanyId(refTable: string | null, refRecord: string | null): Promise<string | null> {
  if (!refRecord || !refTable) return null;
  switch (refTable) {
    case "Company":
      return refRecord;
    case "Assessment": {
      const r = await prisma.assessment.findUnique({ where: { id: refRecord }, select: { companyId: true } });
      return r?.companyId ?? null;
    }
    case "User": {
      const r = await prisma.user.findUnique({
        where: { id: refRecord },
        select: { companyId: true, userCompanies: { select: { companyId: true }, take: 1 } },
      });
      return r?.companyId ?? r?.userCompanies?.[0]?.companyId ?? null;
    }
    case "Finding": {
      const r = await prisma.finding.findUnique({ where: { id: refRecord }, select: { assessment: { select: { companyId: true } } } });
      return r?.assessment?.companyId ?? null;
    }
    case "Action": {
      const r = await prisma.action.findUnique({
        where: { id: refRecord },
        select: { finding: { select: { assessment: { select: { companyId: true } } } } },
      });
      return r?.finding?.assessment?.companyId ?? null;
    }
    case "EvidenceRequest": {
      const r = await prisma.evidenceRequest.findUnique({ where: { id: refRecord }, select: { companyId: true } });
      return r?.companyId ?? null;
    }
    case "ApiKey": {
      const r = await prisma.apiKey.findUnique({ where: { id: refRecord }, select: { companyId: true } });
      return r?.companyId ?? null;
    }
    case "Control": {
      const r = await prisma.control.findUnique({ where: { id: refRecord }, select: { companyId: true } });
      return r?.companyId ?? null;
    }
    // SAMS-015b: per-company refTables that were omitted from the original
    // resolver (and are the majority of prod ActivityLog rows).
    case "MapControl2Requirement": {
      // controlId → Control.companyId.
      const r = await prisma.mapControl2Requirement.findUnique({
        where: { id: refRecord },
        select: { control: { select: { companyId: true } } },
      });
      return r?.control?.companyId ?? null;
    }
    case "AssessmentTemplate": {
      const r = await prisma.assessmentTemplate.findUnique({ where: { id: refRecord }, select: { companyId: true } });
      return r?.companyId ?? null;
    }
    case "Sample": {
      // assessment → Assessment.companyId.
      const r = await prisma.sample.findUnique({ where: { id: refRecord }, select: { assessment: { select: { companyId: true } } } });
      return r?.assessment?.companyId ?? null;
    }
    default:
      return null;
  }
}

/**
 * The single chained-insert for every ActivityLog write path. Resolves (or
 * accepts) the company, then — inside one transaction — takes the per-company
 * advisory lock, reads the current head `FOR UPDATE`, computes the new chainHash
 * and inserts the row. Fire-and-record: it NEVER throws (a failed log write is
 * logged + returns null), preserving the invariant that logging can never fail
 * an upstream request. Returns the new row id, or null on failure.
 */
export async function createChainedActivityLog(entry: ActivityLogChainEntry): Promise<string | null> {
  try {
    const companyId =
      entry.companyId ?? (await resolveCompanyId(entry.refTable ?? null, entry.refRecord ?? null));

    // Nullable-JSON fields: pass the object when present, OMIT when null/undefined
    // (omitting stores SQL NULL, which reads back as null). A literal `null` is not
    // a valid Prisma InputJsonValue.
    const baseData: {
      activityType: string;
      description: string;
      username: string;
      refTable: string | null;
      refRecord: string | null;
      beforeData?: Prisma.InputJsonValue;
      afterData?: Prisma.InputJsonValue;
    } = {
      activityType: entry.activityType,
      description: entry.description,
      username: entry.username,
      refTable: entry.refTable ?? null,
      refRecord: entry.refRecord ?? null,
    };
    if (entry.beforeData != null) baseData.beforeData = entry.beforeData as Prisma.InputJsonValue;
    if (entry.afterData != null) baseData.afterData = entry.afterData as Prisma.InputJsonValue;

    if (!companyId) {
      // Chainless (global / unresolved) row — no hash.
      const id = randomUUID();
      await prisma.activityLog.create({
        data: { id, timestamp: new Date(), ...baseData, companyId: null, chainHash: null },
      });
      return id;
    }

    return await prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const timestamp = new Date();

      // Serialize per company (also covers the empty-chain first write).
      // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns void, which
      // Prisma's $queryRaw can't deserialize.
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, companyId);
      // Read the current head FOR UPDATE.
      const head = (await tx.$queryRawUnsafe(
        `SELECT "chainHash" FROM "ActivityLog" WHERE "companyId" = $1 ORDER BY "createdAt" DESC, "id" DESC LIMIT 1 FOR UPDATE`,
        companyId
      )) as Array<{ chainHash: string | null }>;

      const canonical = canonicalizeRow({
        id,
        timestamp,
        description: entry.description,
        activityType: entry.activityType,
        username: entry.username,
        refTable: entry.refTable ?? null,
        refRecord: entry.refRecord ?? null,
        beforeData: baseData.beforeData,
        afterData: baseData.afterData,
        companyId,
      });
      const prevChainHash = head[0]?.chainHash ?? "";
      const chainHash = computeChainHash(prevChainHash, canonical);

      await tx.activityLog.create({
        data: { id, timestamp, ...baseData, companyId, chainHash, createdAt: timestamp },
      });
      return id;
    });
  } catch (e) {
    console.error("[audit-chain] Failed to log activity:", e);
    return null;
  }
}

/** The current chain-head hash for a company (the weekly digest anchor), or null. */
export async function getChainHeadHash(companyId: string): Promise<string | null> {
  const head = await prisma.activityLog.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { chainHash: true },
  });
  return head?.chainHash ?? null;
}

export type VerifyResult = { ok: boolean; firstBrokenId?: string; count: number };

/**
 * Recompute the chain for a company and return the first broken link. Used by the
 * VERIFY CLI and the functional test. `count` is the number of rows in that
 * company's chain. For an empty/no company chain: ok=true, count=0.
 */
export async function verifyAuditChain(companyId: string): Promise<VerifyResult> {
  const rows = await prisma.activityLog.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let prev = "";
  for (const row of rows) {
    const canonical = canonicalizeRow({
      id: row.id,
      timestamp: row.timestamp,
      description: row.description,
      activityType: row.activityType,
      username: row.username,
      refTable: row.refTable,
      refRecord: row.refRecord,
      beforeData: row.beforeData,
      afterData: row.afterData,
      companyId: row.companyId,
    });
    const expected = computeChainHash(prev, canonical);
    if (row.chainHash !== expected) {
      return { ok: false, firstBrokenId: row.id, count: rows.length };
    }
    prev = row.chainHash as string;
  }
  return { ok: true, count: rows.length };
}
