import type { NextAuthConfig } from "next-auth";

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
      if (!isLoggedIn) return isLoginPage;
      if (isLoginPage) return false;
      if (nextUrl.pathname.startsWith("/admin") && (auth.user as { role?: string } | undefined)?.role !== "Admin") {
        return false;
      }
      return true;
    },
    jwt: ({ token, user }) => {
      if (user) {
        const u = user as { id: string; role: string };
        token.id = u.id;
        const validRoles = ["Admin", "Assessor", "Interviewee"];
        token.role = validRoles.includes(u.role) ? u.role : "Assessor";
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
        (session.user as { id?: string }).id = (token.id as string) || token.sub;
      }
      return session;
    },
  },
};
