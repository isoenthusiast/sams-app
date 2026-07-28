"use client";

import { useState } from "react";
import { KnowledgebaseView } from "./KnowledgebaseView";
import { ListKnowledgeView } from "./ListKnowledgeView";
import { DocumentsAdminView } from "./DocumentsAdminView";

const MENU_ITEMS = [
  { key: "entry", label: "📝 Knowledge Entry" },
  { key: "list", label: "📋 List Knowledge" },
  { key: "documents", label: "📄 Documents" },
] as const;

export function KnowledgebaseManagementView({
  entries, processAreas, companyId, companies, standards,
}: {
  entries: any[]; processAreas: any[]; companyId: string | null;
  companies: any[]; standards: any[];
}) {
  const [activeTab, setActiveTab] = useState<string>("entry");

  return (
    <div className="mt-6 flex gap-0 border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[65vh]">
      <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Knowledgebase</h3>
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
        {activeTab === "entry" && <KnowledgebaseView entries={entries} processAreas={processAreas} companyId={companyId} />}
        {activeTab === "list" && <ListKnowledgeView entries={entries} />}
        {activeTab === "documents" && <DocumentsAdminView companies={companies} standards={standards} processAreas={processAreas} />}
      </div>
    </div>
  );
}
