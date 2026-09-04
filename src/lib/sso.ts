/**
 * SAMS-012 — SSO (Microsoft Entra ID) link-by-email decision gate.
 *
 * Settled decision #2 (Feature C): LINK-BY-EMAIL, NO AUTO-PROVISION. SSO login
 * succeeds ONLY if the Entra email matches an ACTIVE existing (wizard-provisioned)
 * user. Unknown email → denied with "contact your administrator"; inactive user →
 * denied; NO account is ever created by SSO (SSO is a login method, not an
 * account source).
 *
 * The decision rule is extracted into a pure function so it can be unit-tested
 * with a mocked user lookup without a live Entra round-trip (the live SSO test is
 * landing-gated on Edward's app registration — see the card).
 *
 * Note: `User.email` is NOT unique in the schema, so the caller must resolve a
 * single candidate via `findFirst` (we refuse to be ambiguous about which user to
 * log in as far beyond the spec's "match an active existing user").
 */

export type SsoUserProbe = {
  id: string;
  role: string;
  active: boolean;
};

export type SsoUserLookup = (email: string) => Promise<SsoUserProbe | null>;

export type SsoDecision =
  | { ok: true }
  | { ok: false; reason: "no_email" | "unknown" | "inactive" };

/**
 * Link-by-email, no auto-provision.
 *   - no_email  → Entra profile carried no email (malformed/guest account) → deny.
 *   - unknown   → no existing SAMS user with that email → deny (never provision).
 *   - inactive  → the matching user exists but is not active → deny.
 *   - else      → allow; the caller grafts the DB user's id/role onto the session.
 */
export async function resolveEntraSignIn(
  email: string | null | undefined,
  lookup: SsoUserLookup
): Promise<SsoDecision> {
  const trimmed = email?.trim();
  if (!trimmed) return { ok: false, reason: "no_email" };
  const user = await lookup(trimmed.toLowerCase());
  if (!user) return { ok: false, reason: "unknown" };
  if (!user.active) return { ok: false, reason: "inactive" };
  return { ok: true };
}

/** The denial redirect used by the NextAuth `signIn` callback (a string URL). */
export const SSO_DENIAL_REDIRECT: Record<"no_email" | "unknown" | "inactive", string> = {
  no_email: "/login?error=sso_account_not_found",
  unknown: "/login?error=sso_account_not_found",
  inactive: "/login?error=sso_account_not_found",
};
