"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import type { PortalCompany } from "@/lib/portal";

const TABS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/portal", label: "Overview", exact: true },
  { href: "/portal/findings", label: "Findings" },
  { href: "/portal/actions", label: "Actions" },
  { href: "/portal/requests", label: "Requests" },
  { href: "/portal/activity", label: "Activity" },
];

/**
 * SAMS-005 portal chrome: simplified, no admin/operator nav. Company name
 * header (with a selector limited to the user's OWN UserCompany mappings when
 * they map to more than one), a card-grid nav, an "App" link for Assessor+
 * roles, and sign-out.
 */
export function PortalHeader({ companies, userName, userRole }: { companies: PortalCompany[]; userName: string; userRole: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const isAssessorPlus = ["Admin", "Superuser", "Assessor"].includes(userRole);

  const requestedCompanyId = sp.get("companyId");
  const activeCompany = companies.find((c) => c.id === requestedCompanyId) ?? companies[0] ?? null;
  const showSelector = companies.length > 1;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-slate-900">Client Portal</span>
            {showSelector && activeCompany ? (
              <select
                aria-label="Portal company"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                defaultValue={activeCompany.id}
                onChange={(e) => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("companyId", e.target.value);
                  window.location.href = url.toString();
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            ) : activeCompany ? (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">{activeCompany.companyName}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {isAssessorPlus ? (
              <Link href="/fla" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                App
              </Link>
            ) : null}
            <span className="text-sm text-slate-600">{userName}</span>
            <SignOutButton />
          </div>
        </div>
        <nav aria-label="Portal navigation" className="mt-3 flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-blue-800 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
