"use client";

import { useEffect, useState } from "react";
import { setSelectedCompanyCookie } from "@/lib/useCompany";

type Company = { id: string; companyID: string; companyName: string };

export function CompanySelector({ companies, isAdmin }: { companies: Company[]; isAdmin: boolean }) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)selectedCompanyId=([^;]*)/);
    const current = match?.[1];
    if (current && companies.some((c) => c.id === current)) {
      setSelected(current);
    } else if (companies.length > 0) {
      // Default: non-admins → first company; admins → SAMS001 if present
      const def = isAdmin ? (companies.find((c) => c.companyID === "SAMS001") ?? companies[0]) : companies[0];
      setSelected(def.id);
      setSelectedCompanyCookie(def.id);
    }
  }, [companies, isAdmin]);

  if (companies.length <= 1 && !isAdmin) return null;

  return (
    <select
      aria-label="Select company"
      value={selected}
      onChange={(e) => {
        setSelected(e.target.value);
        setSelectedCompanyCookie(e.target.value);
        window.location.reload();
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.companyID}</option>
      ))}
    </select>
  );
}
