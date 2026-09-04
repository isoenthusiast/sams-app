import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { portalHasCompanyAccess } from "@/lib/portal";

type PublicCompany = { id: string; companyID: string; companyName: string };

/** Max key label length (settled decision #1). */
export const API_KEY_LABEL_MAX = 100;

/** Round count for bcrypt hashing of API-key plaintext. */
const API_KEY_BCRYPT_ROUNDS = 12;

/**
 * Public read-only API auth (SAMS-011, Phase 3b Feature B).
 *
 * SCOPE-BY-CONSTRUCTION (settled decision #2): the key's `companyId` IS the query
 * scope. The public endpoints resolve the company from the BEARER KEY and never
 * accept or honor a `?companyId=` override. A key can therefore never cross
 * tenants — there is no input that could ask for another company.
 *
 * KEY MATERIAL RULE (settled decision #1): only the bcrypt `keyHash` is stored.
 * The plaintext bearer is generated here, returned to the caller ONCE at
 * creation, and never persisted or logged. Because bcrypt hashing is salted and
 * non-indexable, authenticating a request scans the small set of active (unrevoked)
 * keys and bcrypt-compares — acceptable at pilot scale (documented; no rate limit
 * v1). Bumping `lastUsedAt` is a read-only audit affordance, never a scope factor.
 */

/** Opaque bearer-key prefix so leaked keys are recognisably SAMS and bound to
 *  the generation format. The prefix is NOT secret — the entropy after it is. */
export const API_KEY_PREFIX = "sams_pub_";

/** Public-endpoint error shape: every error is `{ error: string }` (uniform). */
function pubError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Generate a fresh key: returns the PLAINTEXT (shown once) and its bcrypt hash.
 * The plaintext is `sams_pub_` + 48 base64url chars from 36 random bytes
 * (~288 bits of entropy — far beyond brute-force reach even if leaked).
 */
export function generateApiKey(): { plaintext: string; hash: string } {
  const bytes = Buffer.from(require("node:crypto").randomBytes(36));
  const token = bytes.toString("base64url").replace(/[^A-Za-z0-9_-]/g, "x");
  const plaintext = `${API_KEY_PREFIX}${token}`;
  return { plaintext, hash: hashApiKey(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return bcrypt.hashSync(plaintext, API_KEY_BCRYPT_ROUNDS);
}

export function verifyApiKey(plaintext: string, cryptHash: string): boolean {
  // Guard against a malformed stored hash so bcrypt.compare never throws.
  if (!cryptHash || !/^\$2[aby]\$/.test(cryptHash)) return false;
  try {
    return bcrypt.compareSync(plaintext, cryptHash);
  } catch {
    return false;
  }
}

/** The subset of ApiKey we authenticate against (no key material beyond the hash
 *  we need for compare; we never return keyHash/plaintext to any caller). */
type AuthKeyRow = {
  id: string;
  companyId: string;
  keyHash: string;
  revokedAt: Date | null;
};

/**
 * Pull the `Authorization: Bearer <key>` credential, verify it against an active
 * (unrevoked) key, and return the resolved company scope. On success bumps
 * `lastUsedAt`. On failure returns a uniform `{ error }` NextResponse.
 *
 * Returns `{ ok: true, companyId, company, keyId }` or
 * `{ ok: false, response }`.
 *
 * Errors (uniform shape):
 *   - 401 — missing header / malformed header / no matching key.
 *   - 403 — a matching but REVOKED key (e.g. key exists, revokedAt set).
 */
export async function authenticatePublicKey(
  request: Request
): Promise<
  | { ok: true; companyId: string; company: PublicCompany; keyId: string }
  | { ok: false; response: NextResponse }
> {
  const header = request.headers.get("authorization");
  if (!header) {
    return { ok: false, response: pubError("Missing Authorization header", 401) };
  }
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1]) {
    return { ok: false, response: pubError("Malformed Authorization header — expected `Bearer <key>`", 401) };
  }
  const presented = match[1];

  // Scan active keys. We can't index by bcrypt hash, so compare against the small
  // set of unrevoked keys. A revoked key is not scanned here — it is caught by the
  // explicit revokedKey branch below so it can return 403 (not 401).
  const activeKeys = await prisma.apiKey.findMany({
    where: { revokedAt: null },
    select: { id: true, companyId: true, keyHash: true, revokedAt: true },
  });

  let matched: AuthKeyRow | null = null;
  for (const k of activeKeys) {
    if (verifyApiKey(presented, k.keyHash)) {
      matched = k;
      break;
    }
  }

  if (!matched) {
    // Distinguish a revoked key (403) from an unknown/wrong key (401).
    const revoked = await prisma.apiKey.findFirst({
      where: { revokedAt: { not: null } },
      select: { id: true, companyId: true, keyHash: true, revokedAt: true },
    });
    // Only report 403 when the presented key ACTUALLY matches a revoked key.
    if (revoked && verifyApiKey(presented, revoked.keyHash)) {
      return { ok: false, response: pubError("API key has been revoked", 403) };
    }
    return { ok: false, response: pubError("Invalid API key", 401) };
  }

  // Bump lastUsedAt (read-only audit affordance). Failure here must NOT reject a
  // valid request — log and continue.
  try {
    await prisma.apiKey.update({ where: { id: matched.id }, data: { lastUsedAt: new Date() } });
  } catch (err) {
    console.error("Failed to bump apiKey.lastUsedAt:", err);
  }

  const company = await prisma.company.findUnique({
    where: { id: matched.companyId },
    select: { id: true, companyID: true, companyName: true },
  });
  if (!company) {
    // The key's company was hard-deleted; the key is orphaned — treat as invalid.
    return { ok: false, response: pubError("API key has no owning company", 401) };
  }

  return { ok: true, companyId: company.id, company, keyId: matched.id };
}

/** Extract the key plaintext from a request for re-use by callers that need it
 *  (e.g. tests); not used for scope. */
export function bearerPlaintext(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/* ── Key-management authorization (client Admin + provider) ───────────────── */

export type KeyManagerResult =
  | {
      ok: true;
      userId: string;
      role: string;
      providerRole: string | null;
      isProvider: boolean;
      companyId: string;
      company: PublicCompany;
    }
  | { ok: false; response: NextResponse };

/**
 * Resolve + authorize a key-management request (create / list / revoke).
 *
 * Callers: `POST/GET /api/admin/api-keys` and `DELETE /api/admin/api-keys/[id]`.
 *
 * Gate (settled decision #5 — client Admin (portal settings) + provider):
 *   - PROVIDER plane (session.user.providerRole set) may manage keys for ANY
 *     company; `requestedCompanyId` is REQUIRED (a provider has no natural single
 *     company). Missing/invalid company → 400/404.
 *   - CLIENT Admin: role must be `Admin` or `Superuser` (the "client Admin"
 *     gate), AND the target company must be one the user belongs to
 *     (`portalHasCompanyAccess`). If `requestedCompanyId` is given it must be a
 *     company the user is a member of; otherwise it defaults to the user's home
 *     `User.companyId`. Non-member target → 403.
 *
 * Errors (uniform `{ error }`): 401 unauthenticated; 400 missing company
 * (provider) / bad input; 403 not allowed / not a member; 404 company unknown.
 */
export async function authorizeApiKeyManager(
  requestedCompanyId: string | null
): Promise<KeyManagerResult> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; role?: string; providerRole?: string | null; name?: string | null }
    | undefined;
  if (!user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const userId = user.id;
  const role = user.role ?? "";
  const providerRole = user.providerRole ?? null;

  const resolveCompany = async (companyId: string): Promise<{ company: PublicCompany } | null> => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, companyID: true, companyName: true },
    });
    return company ? { company } : null;
  };

  // Provider plane: any company, companyId required.
  if (providerRole) {
    if (!requestedCompanyId) {
      return { ok: false, response: NextResponse.json({ error: "companyId is required for provider key management" }, { status: 400 }) };
    }
    const found = await resolveCompany(requestedCompanyId);
    if (!found) {
      return { ok: false, response: NextResponse.json({ error: "Company not found" }, { status: 404 }) };
    }
    return { ok: true, userId, role, providerRole, isProvider: true, companyId: requestedCompanyId, company: found.company };
  }

  // Client Admin gate: Admin/Superuser only.
  if (role !== "Admin" && role !== "Superuser") {
    return { ok: false, response: NextResponse.json({ error: "Client Admin access required to manage API keys" }, { status: 403 }) };
  }

  // Determine the target company: requested (must be a member) or home company.
  let targetCompanyId = requestedCompanyId;
  if (!targetCompanyId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
    targetCompanyId = u?.companyId ?? null;
  }
  if (!targetCompanyId) {
    return { ok: false, response: NextResponse.json({ error: "No company available for key management" }, { status: 400 }) };
  }
  const member = await portalHasCompanyAccess(userId, targetCompanyId);
  if (!member) {
    return { ok: false, response: NextResponse.json({ error: "Access denied for company" }, { status: 403 }) };
  }
  const found = await resolveCompany(targetCompanyId);
  if (!found) {
    return { ok: false, response: NextResponse.json({ error: "Company not found" }, { status: 404 }) };
  }
  return { ok: true, userId, role, providerRole, isProvider: false, companyId: targetCompanyId, company: found.company };
}

/** A key row as surfaced in LIST — NEVER any keyHash/plaintext. */
export type ApiKeySummary = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: { id: string; name: string | null } | null;
};

export function toApiKeySummary(row: {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdByUser: { id: string; name: string | null } | null;
}): ApiKeySummary {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdBy: row.createdByUser ? { id: row.createdByUser.id, name: row.createdByUser.name } : null,
  };
}
