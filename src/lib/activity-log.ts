import { createChainedActivityLog } from "@/lib/audit-chain";

export interface ActivityLogEntry {
  activityType: string;
  description: string;
  username: string;
  refTable?: string | null;
  refRecord?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  /** Optional company hint. When omitted, resolved from refTable/refRecord. */
  companyId?: string | null;
}

/**
 * SAMS-015: every ActivityLog write is now CHAINED (per-company hash chain).
 * Routes through the shared `createChainedActivityLog` helper in
 * `@/lib/audit-chain` so the canonicalization, ordering, per-company lock and
 * hash computation are identical to the backfill and the verifier. NEVER throws
 * (returns null on failure) — a failed log write can never fail a request.
 */
export async function logActivity(entry: ActivityLogEntry): Promise<string | null> {
  return createChainedActivityLog(entry);
}

export function getUsername(session: { user?: { name?: string | null } } | null): string {
  return (session?.user as { name?: string })?.name ?? "Unknown";
}
