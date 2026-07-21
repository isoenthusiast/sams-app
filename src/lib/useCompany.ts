"use client";

import { useEffect, useState } from "react";

export function useSelectedCompanyId(): string | null {
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)selectedCompanyId=([^;]*)/);
    setCompanyId(match?.[1] ?? null);
  }, []);
  return companyId;
}

export function setSelectedCompanyCookie(companyId: string) {
  document.cookie = `selectedCompanyId=${companyId}; path=/; max-age=${60 * 60 * 24 * 365}`;
}
