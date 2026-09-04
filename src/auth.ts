import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

/**
 * Full NextAuth config (SAMS-012, Feature C — SSO + force-password-change).
 *
 * Providers: Credentials (kept — admin recovery + non-SSO clients) and Microsoft
 * Entra ID (global, one registration). The Entra provider env contract is
 * `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/TENANT` (Edward supplies at landing); we
 * also accept the standard `AUTH_MICROSOFT_ENTRA_ID_ISSUER` override. The tenant
 * is resolved to the issuer (`https://login.microsoftonline.com/<tenant>/v2.0`).
 *
 * This config runs in the app's Node server. The `jwt` callback here OVERRIDES the
 * pure (proxy-safe) one in authConfig to add the session-update refresh that keeps
 * the force-password-change flag in sync with the DB after a password change.
 */

/** Resolve the Entra issuer: explicit ISSUER, else build from TENANT, else /common. */
function resolveEntraIssuer(): string | undefined {
  if (process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER) return process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  const tenant = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT;
  if (tenant && tenant.trim()) return `https://login.microsoftonline.com/${tenant.trim()}/v2.0`;
  return undefined; // provider defaults to /common (any tenant)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      authorize: async (credentials) => {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username },
          include: { userCompanies: { include: { company: { select: { archivedAt: true } } } } },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Only active users can log in
        if (!user.active) return null;

        // Data Trust Gate (SAMS-003): block logins for archived companies. A user
        // is bound to a company via User.companyId or a UserCompany mapping; if
        // ANY of those companies is archived, the user cannot sign in until a
        // provider/admin reinstates it. Admins are EXEMPT — they are the
        // operational staff who perform offboarding/reinstatement and must retain
        // access (the provider admin typically fills this role too).
        const isAdminRole = user.role === "Admin";
        const archivedViaCompanyId =
          !!(user.companyId && (await prisma.company.findFirst({
            where: { id: user.companyId, archivedAt: { not: null } },
            select: { id: true },
          })));
        const archivedViaMapping = user.userCompanies.some((uc) => uc.company.archivedAt);
        if (!isAdminRole && (archivedViaCompanyId || archivedViaMapping)) return null;

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          providerRole: user.providerRole,
          // SAMS-012: carry the force-password-change flag so the jwt callback stamps
          // the token and the middleware forces the user through /change-password.
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
    // Entra ID is GLOBAL for the platform (one registration). Registered ONLY when
    // Edward's credentials are present — the app must still boot/build without them
    // (the live SSO round-trip is landing-gated on the app registration).
    ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: resolveEntraIssuer(),
          }),
        ]
      : []),
  ],
  callbacks: {
    // MERGE with authConfig.callbacks (session/signIn/authorized must survive) —
    // only the jwt is overridden, with an EXTRA branch that refreshes the
    // force-change flag on session update.
    ...authConfig.callbacks,
    jwt: async ({ token, user, account, trigger }) => {
      const isEntra = account?.provider === "microsoft-entra-id";
      const email = ((user as { email?: string })?.email ?? null) ?? (token.email as string | undefined);

      // (b) Session update (e.g. after a successful forced password change):
      //     re-read the authoritative flag/role from the DB and re-encode the token.
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user
          .findUnique({
            where: { id: token.id as string },
            select: { id: true, role: true, providerRole: true, mustChangePassword: true },
          })
          .catch(() => null);
        if (fresh) {
          token.id = fresh.id;
          token.role = fresh.role;
          token.providerRole = fresh.providerRole ?? null;
          // SSO users authenticate via their IdP — never force them through the
          // SAMS password-change flow, even on a session refresh.
          token.mustChangePassword = token.sso === true ? false : fresh.mustChangePassword;
        }
        return token;
      }

      // (a) Entra sign-in: resolve by email (defensive — the signIn callback already
      //     grafted id/role onto user, but this is authoritative) — SSO users are
      //     NOT forced through change-password.
      if (isEntra) {
        if (email) {
          const dbUser = await prisma.user
            .findFirst({
              where: { email },
              select: { id: true, role: true, providerRole: true, mustChangePassword: true },
            })
            .catch(() => null);
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.providerRole = dbUser.providerRole ?? null;
            token.email = email;
            token.sso = true;
            token.mustChangePassword = false;
          }
        }
        return token;
      }

      // (c) Credentials sign-in: carry the authorize() user + force-change flag.
      if (user) {
        const u = user as { id: string; role: string; providerRole?: string | null; mustChangePassword?: boolean };
        token.id = u.id;
        const validRoles = ["Admin", "Superuser", "Assessor", "Interviewee"];
        token.role = validRoles.includes(u.role) ? u.role : "Assessor";
        token.providerRole = u.providerRole ?? null;
        token.mustChangePassword = u.mustChangePassword ?? false;
      }
      return token;
    },
  },
});
