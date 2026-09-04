import type { NextAuthConfig } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveEntraSignIn, SSO_DENIAL_REDIRECT } from "@/lib/sso";

/**
 * Shared NextAuth config (SAMS-012, Feature C — SSO + force-password-change).
 *
 * This is used by BOTH the app's full config (src/auth.ts) and the middleware
 * proxy (src/proxy.ts). Because the proxy renders the `session`/`authorized`
 * callbacks in the middleware runtime, this file keeps the PROXY-EXECUTED
 * callbacks pure (no live DB writes/lookups in the session path). The Entra
 * identity graft and the force-change flag are resolved in `signIn`/`jwt`,
 * which only run in the app's Node server (never in the middleware).
 *
 * Settled decisions (Feature C):
 *  1. Global Microsoft Entra ID provider (one registration) — env
 *     AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/TENANT (Edward supplies; never in git).
 *  2. LINK-BY-EMAIL, NO AUTO-PROVISION — SSO succeeds only if the Entra email
 *     matches an ACTIVE existing user; unknown/inactive → denied, no account.
 *  3. Credentials login stays (admin recovery + non-SSO clients).
 *  4. User.mustChangePassword — credentials login with the flag redirects to
 *     /change-password; SSO users authenticate via their IdP and are NOT forced
 *     through it (C4 describes credentials only).
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/login";
      const mustChange = !!(auth?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword;
      const isChangePage = nextUrl.pathname === "/change-password";
      if (!isLoggedIn) return isLoginPage;
      if (isLoginPage) return false;
      // Force-change gate (consistent with src/proxy.ts).
      if (mustChange && !isChangePage) return false;
      if (isChangePage && !mustChange) return false;
      if (nextUrl.pathname.startsWith("/admin") && (auth?.user as { role?: string } | undefined)?.role !== "Admin") {
        return false;
      }
      return true;
    },

    // Link-by-email SSO gate (runs in the Node callback handler on sign-in).
    signIn: async ({ user, account }) => {
      if (account?.provider === "microsoft-entra-id") {
        const email = ((user as { email?: string | null })?.email ?? null)?.trim().toLowerCase() ?? null;
        const decision = await resolveEntraSignIn(email, async (e) => {
          const u = await prisma.user.findFirst({
            // P1: the Entra email is lowercased but a provisioned (wizard) email may
            // be stored mixed-case (onboarding stores it as-typed, trim only). Match
            // case-insensitively so a lowercased Entra email links to the DB user.
            where: { email: { equals: e, mode: "insensitive" } },
            select: { id: true, role: true, active: true },
          });
          return u ? { id: u.id, role: u.role, active: u.active } : null;
        });
        if (!decision.ok) return SSO_DENIAL_REDIRECT[decision.reason];

        // Graft the REAL SAMS user identity onto the OAuth user object so the
        // jwt callback (which runs next) signs the token with the DB user id/role,
        // NOT the Entra provider subject id. SSO users are NOT forced through the
        // change-password flow, so mustChangePassword is left off the token here.
        const resolved = await prisma.user.findFirst({
          // P1: same case-insensitive match as the decision lookup (see above).
          where: { email: { equals: email!, mode: "insensitive" } },
          select: { id: true, role: true, providerRole: true },
        });
        if (resolved) {
          const u = user as { id?: string; role?: string; providerRole?: string | null };
          u.id = resolved.id;
          u.role = resolved.role;
          u.providerRole = resolved.providerRole ?? null;
        }
        return true;
      }
      return true;
    },

    // Pure (proxy-safe): copies identity + force-change flag from the user object.
    jwt: ({ token, user }) => {
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

    session: ({ session, token }) => {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
        (session.user as { providerRole?: string | null }).providerRole = (token.providerRole as string | null | undefined) ?? null;
        (session.user as { id?: string }).id = (token.id as string) || token.sub;
        // Surface the force-password-change flag to authz / middleware.
        (session.user as { mustChangePassword?: boolean }).mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
  },
};
