"use client";

import { useState } from "react";
import { TemplateActivityTypesView } from "./TemplateActivityTypesView";

const MENU_ITEMS = [
  { key: "assessment", label: "📋 Assessment Templates" },
  { key: "activities", label: "🔗 Activities Templates" },
] as const;

export function TemplatesManagementView({
  templates, activityTypes,
}: {
  templates: any[]; activityTypes: any[];
}) {
  const [activeTab, setActiveTab] = useState<string>("assessment");

  return (
    <div className="mt-6 flex gap-0 border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[65vh]">
      <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Templates Admin</h3>
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
        {activeTab === "assessment" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-2">{templates.length} template(s)</p>
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{t.name}</div>
                    {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                  </div>
                  <div className="text-xs text-slate-400">{t._count?.controlLinkages ?? 0} controls</div>
                </div>
              </div>
            ))}
            {templates.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No templates found.</p>}
          </div>
        )}
        {activeTab === "activities" && (
          <TemplateActivityTypesView templates={templates} activityTypes={activityTypes} />
        )}
      </div>
    </div>
  );
}
