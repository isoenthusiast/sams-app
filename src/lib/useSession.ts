"use client";

import { useSession as useNextAuthSession } from "next-auth/react";

type SessionUser = {
  id?: string;
  name?: string | null;
  role?: string;
  providerRole?: string | null;
};

export function useSession() {
  const { data: session, status } = useNextAuthSession();
  const user = (session?.user as SessionUser) ?? null;
  return {
    user,
    isAdmin: user?.role === "Admin",
    isAssessor: user?.role === "Assessor",
    isProvider: !!user?.providerRole,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
  };
}
