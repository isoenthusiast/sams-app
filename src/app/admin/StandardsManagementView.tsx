"use client";

import { useState } from "react";
import { StandardAdminView } from "./StandardAdminView";
import { ProcessAreasAdminView } from "./ProcessAreasAdminView";
import { RequirementsView } from "./RequirementsView";
import { ControlsAdminView } from "./ControlsAdminView";
import { AssuranceProtocolView } from "./AssuranceProtocolView";

const MENU_ITEMS = [
  { key: "standards", label: "📋 Manage Standards" },
  { key: "processareas", label: "🔄 Process Areas" },
  { key: "requirements", label: "📝 Requirements" },
  { key: "controls", label: "🎛 Controls" },
  { key: "protocols", label: "📋 Protocols" },
] as const;

export function StandardsManagementView({
  standards, processAreas, requirements, allStandards, controls, controlPas, companies,
}: {
  standards: any[]; processAreas: any[]; requirements: any[]; allStandards: any[];
  controls: any[]; controlPas: any[]; companies: any[];
}) {
  const [activeTab, setActiveTab] = useState<string>("standards");

  return (
    <div className="mt-6 flex gap-0 border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[65vh]">
      <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Standards Admin</h3>
        </div>
        <nav className="flex-1 py-2">
          {MENU_ITEMS.map(item => (
            <button key={item.key} onClick={() => setActiveTab(item.key)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activeTab === item.key ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-l-blue-600" : "text-slate-600 hover:bg-slate-100 border-l-2 border-l-transparent"
              }`}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-5 min-w-0">
        {activeTab === "standards" && <StandardAdminView initialStandards={standards} companies={companies} />}
        {activeTab === "processareas" && <ProcessAreasAdminView initialProcessAreas={processAreas} initialStandards={allStandards} />}
        {activeTab === "requirements" && <RequirementsView requirements={requirements} standards={allStandards} />}
        {activeTab === "controls" && <ControlsAdminView initialControls={controls} initialProcessAreas={controlPas} />}
        {activeTab === "protocols" && <AssuranceProtocolView />}
      </div>
    </div>
  );
}
