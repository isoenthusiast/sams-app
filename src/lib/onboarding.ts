import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Role } from "@/generated/prisma/client";

/**
 * SAMS-008 — Pilot Onboarding Wizard provider-plane helpers.
 *
 * The wizard is a provider motion (`/operator/onboarding`, providerRole required).
 * This module holds the dry-run/validation + commit logic for the two write-heavy
 * steps (company creation is inline in the route; content adoption reuses
 * `@/lib/bootstrap`).
 *
 * SECURITY RULES (settled decisions #4/#5):
 *   - DRY-RUN before every write: `validateUserRows` previews, `provisionUsers`
 *     commits. Never validate-and-write in one blind call.
 *   - Temp passwords are generated, bcrypt-hashed, and stored ONLY in an
 *     in-memory transient store keyed by a wizardId. They are revealed EXACTLY
 *     ONCE via `finalize` (which consumes the entry) — never in ActivityLog,
 *     never in the users-commit response, never on the server console.
 */

// ── Rows ───────────────────────────────────────────────────────────────────

export type OnboardingUserRow = {
  name: string;
  username: string;
  email?: string;
  role?: string; // defaults to "Assessor"
  managerName?: string; // optional — resolved against existing users
};

export type OnboardingUserValidation = {
  total: number;
  valid: number;
  duplicates: Array<{ kind: "existing" | "batch"; username: string; name: string }>;
  invalidRoles: Array<{ username: string; role: string }>;
  // Rows the draft-schema would otherwise let slip through (empty name/username).
  missingFields: Array<{ index: number; username: string; fields: ("name" | "username")[] }>;
  unresolvedManagers: Array<{ username: string; managerName: string }>;
  managerResolution: { requested: number; resolved: number; rate: number | null };
};

/**
 * Whether a validation report is clean enough to commit. The dry-run and the
 * commit path MUST share this single rule set so the server enforces what the
 * preview blocks (settled decision #4 / DoD (b)). Unresolved managers are a
 * *warning* (the row is still created with the manager stored as text), so they
 * do NOT block; duplicates, invalid roles and missing name/username do.
 */
export function isProvisionBlocked(report: OnboardingUserValidation): boolean {
  return report.duplicates.length > 0 || report.invalidRoles.length > 0 || report.missingFields.length > 0;
}

/**
 * Thrown by the COMMIT path when the write boundary re-validation finds issues
 * that should have been caught by the dry-run. Carries the HTTP-ish status and
 * the full report so the route can refuse with 4xx and zero writes.
 */
export class ProvisionValidationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly report: OnboardingUserValidation;
  constructor(report: OnboardingUserValidation) {
    const hasDuplicates = report.duplicates.length > 0;
    const status = hasDuplicates ? 409 : 422;
    const code = hasDuplicates ? "VALIDATION_DUPLICATES" : "VALIDATION_BAD_ROWS";
    super(
      `Provision refused: fix ${report.duplicates.length + report.invalidRoles.length + report.missingFields.length} row(s). Run the dry-run (dryRun=true) and commit only when clean.`
    );
    this.name = "ProvisionValidationError";
    this.status = status;
    this.code = code;
    this.report = report;
  }
}

/** Roles the wizard may provision. Anything else is flagged as an invalid role. */
export const PROVISION_ROLES: Role[] = ["Assessor", "Admin"];

export function generateTempPassword(len = 12): string {
  // Avoid ambiguous characters (0/O, 1/l/I) for operator transcription.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#%*+";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

/** Resolve a manager name/username to an existing User (any company) or null. */
export async function resolveManager(input: string | undefined): Promise<{ name: string; username: string } | null> {
  if (!input?.trim()) return null;
  const needle = input.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { equals: needle, mode: "insensitive" } },
        { username: { equals: needle, mode: "insensitive" } },
        { preferredName: { equals: needle, mode: "insensitive" } },
      ],
    },
    select: { name: true, username: true },
  });
  return user ? { name: user.name, username: user.username } : null;
}

/**
 * DRY-RUN: validate a batch of user rows WITHOUT writing.
 * Carries the settled #4 semantics: duplicates (existing + within-batch),
 * invalid roles, unresolved managers, with a manager-resolution rate.
 */
export async function validateUserRows(rows: OnboardingUserRow[]): Promise<OnboardingUserValidation> {
  const total = rows.length;
  const duplicates: OnboardingUserValidation["duplicates"] = [];
  const invalidRoles: OnboardingUserValidation["invalidRoles"] = [];
  const missingFields: OnboardingUserValidation["missingFields"] = [];
  const unresolvedManagers: OnboardingUserValidation["unresolvedManagers"] = [];

  const usernames = rows.map((r) => r.username?.trim()).filter(Boolean);
  const batchCounts = new Map<string, number>();
  for (const u of usernames) {
    const k = u.toLowerCase();
    batchCounts.set(k, (batchCounts.get(k) ?? 0) + 1);
  }

  // Existing usernames (globally unique). Query case-insensitively so an
  // operator entering a case-variant of an existing username is still caught
  // (the DB unique index is case-sensitive, but the wizard should not let a
  // near-collision through to a raw DB error).
  const existingSet = new Set<string>();
  if (usernames.length > 0) {
    const unique = [...new Set(usernames)];
    const found = await prisma.user.findMany({
      where: { OR: unique.map((u) => ({ username: { equals: u, mode: "insensitive" } })) },
      select: { username: true },
    });
    for (const f of found) existingSet.add(f.username.toLowerCase());
  }

  let managerRequested = 0;
  let managerResolved = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const u = row.username?.trim().toLowerCase() ?? "";
    // A row is invalid for THREE independent reasons (reported separately so the
    // operator sees each): duplicate username, invalid role, missing field.
    if (existingSet.has(u)) duplicates.push({ kind: "existing", username: row.username, name: row.name });
    if ((batchCounts.get(u) ?? 0) > 1) duplicates.push({ kind: "batch", username: row.username, name: row.name });

    // Role check (default Assessor).
    const role = (row.role?.trim() || "Assessor") as Role;
    if (!PROVISION_ROLES.includes(role)) invalidRoles.push({ username: row.username, role });

    // Missing name/username (the client-side parseCsv backstop; the server must
    // enforce the same rule so a bare API commit can't inject junk rows).
    const missing: ("name" | "username")[] = [];
    if (!row.name?.trim()) missing.push("name");
    if (!row.username?.trim()) missing.push("username");
    if (missing.length > 0) missingFields.push({ index: i, username: row.username, fields: missing });

    // Manager resolution.
    if (row.managerName?.trim()) {
      managerRequested++;
      const resolved = await resolveManager(row.managerName);
      if (resolved) managerResolved++;
      else unresolvedManagers.push({ username: row.username, managerName: row.managerName });
    }
  }

  // A row flagged as duplicate OR invalid-role OR missing-field is not "valid"
  // (commit blocked for it). Valid = no duplicate, no invalid role, no missing
  // field. Empty-username rows are already dropped from `usernames`.
  const invalidSet = new Set([
    ...duplicates.map((d) => d.username.toLowerCase()),
    ...invalidRoles.map((i) => i.username.toLowerCase()),
    ...missingFields.map((m) => m.username.toLowerCase()),
  ]);
  const valid = usernames.filter((u) => !invalidSet.has(u.toLowerCase())).length;

  return {
    total,
    valid,
    duplicates,
    invalidRoles,
    missingFields,
    unresolvedManagers,
    managerResolution: {
      requested: managerRequested,
      resolved: managerResolved,
      rate: managerRequested === 0 ? null : Math.round((managerResolved / managerRequested) * 100),
    },
  };
}

export type ProvisionedUser = {
  username: string;
  name: string;
  // tempPassword reveal is intentionally NOT part of the commit response: it is
  // returned exactly once by `finalize` (see consumeTempPasswords).
};

export type ProvisionResult = {
  created: number;
  wizardId: string;
  users: ProvisionedUser[];
  managerResolution: { requested: number; resolved: number; rate: number | null };
};

// ── Transient temp-password store ──────────────────────────────────────────
// Module-level single-instance store. Acceptable for the pilot wizard (operator
// runs it in one sitting); documented as not surviving a server restart.
const tempPasswordStore = new Map<
  string,
  Map<string, { username: string; tempPassword: string }>
>();

export function storeTempPasswords(
  wizardId: string,
  entries: Array<{ userId: string; username: string; tempPassword: string }>
) {
  tempPasswordStore.set(
    wizardId,
    new Map(entries.map((e) => [e.userId, { username: e.username, tempPassword: e.tempPassword }]))
  );
}

/** Return (and DELETE) the temp passwords for a wizardId. Consumed on reveal. */
export function consumeTempPasswords(wizardId: string): Array<{ username: string; tempPassword: string }> {
  const entry = tempPasswordStore.get(wizardId);
  if (!entry) return [];
  tempPasswordStore.delete(wizardId);
  return [...entry.values()];
}

/**
 * COMMIT: provision a batch of users for a company. TRANSACTIONAL per company —
 * if any create fails (e.g. a unique-username violation appearing between the
 * dry-run and here), the whole batch rolls back → ZERO partial users for that
 * company (settled decision #3 / DoD test (e)).
 *
 * Each user: assigned `role` (default Assessor), `active: true`, bound to the
 * company via `companyId` + a `UserCompany` mapping. Temp passwords are
 * bcrypt-hashed into `passwordHash` and held ONLY in the transient store.
 */
export async function provisionUsers(params: {
  companyId: string;
  rows: OnboardingUserRow[];
}): Promise<ProvisionResult> {
  const { companyId, rows } = params;

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new Error("Company not found");

  // WRITE-BOUNDARY RE-VALIDATION (review round-1 fix, spec settled #4 / DoD (b)):
  // never trust rows reaching the commit — the dry-run and the commit share one
  // rule set. Refuse with 4xx (and ZERO writes) before opening the transaction,
  // so junk (bad role, empty name/username, duplicates) can't reach the DB even
  // when a client bypasses the UI's dry-run-first flow.
  const validation = await validateUserRows(rows);
  if (isProvisionBlocked(validation)) throw new ProvisionValidationError(validation);

  const wizardId = `wiz_${crypto.randomUUID()}`;
  const passwordEntries: Array<{ userId: string; username: string; tempPassword: string }> = [];

  const created = await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const role = (row.role?.trim() || "Assessor") as Role;
      const temp = generateTempPassword();
      const hash = bcrypt.hashSync(temp, 10);
      const manager = await resolveManagerExplicit(tx, row.managerName);

      const user = await tx.user.create({
        data: {
          name: row.name.trim(),
          username: row.username.trim(),
          email: row.email?.trim() || null,
          passwordHash: hash,
          role,
          active: true,
          companyId,
          managerName: manager?.name ?? row.managerName?.trim() ?? null,
          managerUsername: manager?.username ?? null,
        },
      });
      await tx.userCompany.create({ data: { userId: user.id, companyId } });

      passwordEntries.push({ userId: user.id, username: row.username.trim(), tempPassword: temp });
    }
    return passwordEntries.length;
  });

  storeTempPasswords(wizardId, passwordEntries);

  const managerRequested = rows.filter((r) => r.managerName?.trim()).length;
  // Recompute resolution via the same resolve path (dry-run parity).
  const resolvedCount = await Promise.all(
    rows.map((r) => resolveManager(r.managerName))
  ).then((res) => res.filter(Boolean).length);

  return {
    created,
    wizardId,
    users: rows.map((r) => ({ username: r.username.trim(), name: r.name.trim() })),
    managerResolution: {
      requested: managerRequested,
      resolved: resolvedCount,
      rate: managerRequested === 0 ? null : Math.round((resolvedCount / managerRequested) * 100),
    },
  };
}

/** Resolve a manager using a transaction client (for the commit path). */
async function resolveManagerExplicit(
  tx: { user: { findFirst: (a: { where: Record<string, unknown>; select: { name: true; username: true } }) => Promise<{ name: string; username: string } | null> } },
  input: string | undefined
): Promise<{ name: string; username: string } | null> {
  if (!input?.trim()) return null;
  const needle = input.trim();
  const user = await tx.user.findFirst({
    where: {
      OR: [
        { name: { equals: needle, mode: "insensitive" } },
        { username: { equals: needle, mode: "insensitive" } },
        { preferredName: { equals: needle, mode: "insensitive" } },
      ],
    },
    select: { name: true, username: true },
  });
  return user ? { name: user.name, username: user.username } : null;
}

// ── Final report (step 4) ──────────────────────────────────────────────────

export type OnboardingReport = {
  companyId: string;
  companyID: string;
  companyName: string;
  content: {
    standards: number;
    processAreas: number;
    requirements: number;
    controls: number;
    mapControl2Requirement: number;
  };
  users: { count: number; managerResolution: { requested: number; resolved: number; rate: number | null } };
  approvedForGoLive: boolean;
};

export async function buildOnboardingReport(companyId: string): Promise<OnboardingReport> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, companyID: true, companyName: true, archivedAt: true },
  });
  if (!company) throw new Error("Company not found");

  const [standards, processAreas, requirements, controls, mapControl2Requirement, userCount] = await Promise.all([
    prisma.standard.count({ where: { companyId } }),
    prisma.processArea.count({ where: { companyId } }),
    prisma.requirement.count({ where: { companyId } }),
    prisma.control.count({ where: { companyId } }),
    prisma.mapControl2Requirement.count({ where: { control: { companyId } } }),
    prisma.user.count({ where: { companyId } }),
  ]);

  const approvedForGoLive = requirements > 0 && userCount > 0 && company.archivedAt == null;

  return {
    companyId: company.id,
    companyID: company.companyID,
    companyName: company.companyName,
    content: { standards, processAreas, requirements, controls, mapControl2Requirement },
    users: {
      count: userCount,
      managerResolution: { requested: 0, resolved: 0, rate: null },
    },
    approvedForGoLive,
  };
}
