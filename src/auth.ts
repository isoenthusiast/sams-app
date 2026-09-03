import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

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

        return { id: user.id, name: user.name, role: user.role, providerRole: user.providerRole };
      },
    }),
  ],
});
