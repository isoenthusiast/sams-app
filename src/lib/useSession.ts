"use client";

import { useSession as useNextAuthSession } from "next-auth/react";

type SessionUser = {
  id?: string;
  name?: string | null;
  role?: string;
};

export function useSession() {
  const { data: session, status } = useNextAuthSession();
  return {
    user: (session?.user as SessionUser) ?? null,
    isAdmin: (session?.user as SessionUser)?.role === "Admin",
    isAssessor: (session?.user as SessionUser)?.role === "Assessor",
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
  };
}
