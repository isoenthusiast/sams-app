"use client";

import { useState, useEffect } from "react";
import { CompanyAdminView } from "./CompanyAdminView";
import { OrgChartView } from "./OrgChartView";
import { DepartmentAdminView } from "./DepartmentAdminView";

type Company = {
  id: string; companyID: string; companyName: string;
  shortName?: string | null; referenceID?: string | null;
};

const MENU_ITEMS = [
  { key: "companies", label: "🏢 Managed Companies" },
  { key: "org-chart", label: "👥 Org Chart" },
  { key: "departments", label: "📂 Departments" },
] as const;

export function CompanyManagementView({ companies }: { companies: Company[] }) {
  const [activeTab, setActiveTab] = useState<string>("companies");

  return (
    <div className="mt-6 flex gap-0 border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[65vh]">
      {/* ── LEFT: Menu Panel ── */}
      <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Admin</h3>
        </div>
        <nav className="flex-1 py-2">
          {MENU_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activeTab === item.key
                  ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-l-blue-600"
                  : "text-slate-600 hover:bg-slate-100 border-l-2 border-l-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── RIGHT: Content Panel ── */}
      <div className="flex-1 overflow-y-auto p-5 min-w-0">
        {activeTab === "companies" && <CompanyAdminView initialCompanies={companies} />}
        {activeTab === "departments" && (
          <DepartmentManagementWrapper companies={companies} />
        )}
        {activeTab === "org-chart" && <OrgChartView />}
      </div>
    </div>
  );
}

/** Fetches departments client-side and renders the admin view */
function DepartmentManagementWrapper({ companies }: { companies: Company[] }) {
  const [departments, setDepartments] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/departments")
      .then(r => r.json())
      .then(data => setDepartments(data.departments ?? []))
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (!departments) return <p className="text-sm text-red-500 py-8 text-center">Failed to load</p>;

  return <DepartmentAdminView initialDepartments={departments} />;
}
