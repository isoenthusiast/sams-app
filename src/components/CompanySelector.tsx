"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setSelectedCompanyCookie } from "@/lib/useCompany";

type Company = { id: string; companyID: string; companyName: string };

export function CompanySelector({
  companies,
  isAdmin,
  providerRole,
}: {
  companies: Company[];
  isAdmin: boolean;
  providerRole?: string | null;
}) {
  const [selected, setSelected] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // First priority: URL search param
    const urlCompanyId = searchParams.get("companyId");
    if (urlCompanyId && companies.some((c) => c.id === urlCompanyId)) {
      setSelected(urlCompanyId);
      setSelectedCompanyCookie(urlCompanyId);
      return;
    }
    // Second priority: cookie
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
  }, [companies, isAdmin, searchParams]);

  if (companies.length <= 1 && !isAdmin) return null;

  return (
    <select
      aria-label="Select company"
      value={selected}
      onChange={(e) => {
        const newCompanyId = e.target.value;
        setSelected(newCompanyId);
        // Provider context switches are audit-logged server-side (SAMS-002).
        // Do NOT write the cookie client-side first: POST /api/operator/context-switch
        // sets it server-side (and returns before/after), and writing it here would
        // make the server read before === after at switch time and skip the audit row.
        // The server must see the PREVIOUS company in the cookie when the POST arrives
        // so before/after differ and PROVIDER_CONTEXT_SWITCH is logged. Never block the
        // switch on the audit write. Non-provider sessions keep the synchronous client
        // cookie write (byte-for-byte identical to the pre-SAMS-002 behavior, no POST).
        if (providerRole) {
          fetch("/api/operator/context-switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId: newCompanyId }),
          }).catch(() => {});
        } else {
          setSelectedCompanyCookie(newCompanyId);
        }
        // Navigate with URL param — more reliable than cookie-only reload
        const params = new URLSearchParams(searchParams.toString());
        params.set("companyId", newCompanyId);
        router.push(`/fla?${params.toString()}`);
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.companyID}</option>
      ))}
    </select>
  );
}
