"use client";

import { useState, useMemo } from "react";
import { TemplateActivityTypesView } from "./TemplateActivityTypesView";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

const MENU_ITEMS = [
  { key: "assessment", label: "📋 Assessment Templates" },
  { key: "activities", label: "🔗 Activities Templates" },
] as const;

type Control = {
  id: string; name: string; controlType: string;
  processArea?: { id: string; name: string } | null;
};

type Template = {
  id: string; name: string; description?: string | null;
  companyId?: string | null;
  _count?: { controlLinkages?: number };
  controlLinkages?: Array<{ controlId: string; control: Control }>;
};

export function TemplatesManagementView({
  templates: initialTemplates, activityTypes, allControls,
}: {
  templates: any[]; activityTypes: any[]; allControls: any[];
}) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [activeTab, setActiveTab] = useState<string>("assessment");
  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selectedControlIds, setSelectedControlIds] = useState<Set<string>>(new Set());
  const [controlSearch, setControlSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Group controls by process area for the selector
  const controlsByPA = useMemo(() => {
    const map = new Map<string, { paName: string; controls: Control[] }>();
    for (const c of allControls) {
      const paId = c.processArea?.id ?? "unmapped";
      const paName = c.processArea?.name ?? "Unmapped";
      if (!map.has(paId)) map.set(paId, { paName, controls: [] });
      map.get(paId)!.controls.push(c);
    }
    return [...map.entries()].sort((a, b) => a[1].paName.localeCompare(b[1].paName));
  }, [allControls]);

  const openEdit = (t: Template) => {
    setEditing(t);
    setEditName(t.name);
    setEditDesc(t.description ?? "");
    const existingIds = (t.controlLinkages ?? []).map((l: any) => l.controlId);
    setSelectedControlIds(new Set(existingIds));
    setControlSearch("");
  };

  const toggleControl = (id: string) => {
    setSelectedControlIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editName.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          controlIds: [...selectedControlIds],
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setTemplates(prev => prev.map(t => t.id === updated.id ? {
        ...t,
        name: updated.name,
        description: updated.description,
        controlLinkages: updated.controlLinkages ?? [],
        _count: { controlLinkages: (updated.controlLinkages ?? []).length },
      } : t));
      showToast("Template updated", "success");
      setEditing(null);
    } catch { showToast("Failed to update template", "error"); }
    finally { setSaving(false); }
  };

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
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">{t.name}</div>
                    {t.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</div>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-400">{t._count?.controlLinkages ?? 0} controls</span>
                      {t.companyId && <span className="text-xs text-slate-400">Company: {t.companyId}</span>}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(t)}>✏️ Edit</Button>
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

      {/* Edit Template Modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={`Edit Template — ${editing?.name ?? ""}`}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Template name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional description" />
          </div>

          {/* Control Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Controls ({selectedControlIds.size} selected)
            </label>
            <input type="text" value={controlSearch} onChange={(e) => setControlSearch(e.target.value)}
              placeholder="Search controls…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <div className="border border-slate-200 rounded-md max-h-[40vh] overflow-y-auto divide-y divide-slate-100">
              {controlsByPA.map(([paId, { paName, controls }]) => {
                const filtered = controlSearch
                  ? controls.filter(c => c.name.toLowerCase().includes(controlSearch.toLowerCase()))
                  : controls;
                if (filtered.length === 0) return null;
                return (
                  <div key={paId} className="px-2 py-1">
                    <div className="text-xs font-semibold text-slate-500 uppercase py-1 px-1">{paName}</div>
                    {filtered.map(c => (
                      <label key={c.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedControlIds.has(c.id)} onChange={() => toggleControl(c.id)} className="rounded" />
                        <span className="flex-1">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.controlType}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scoping note */}
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <strong>📋 Template Scoping:</strong> Templates created under <strong>SAMS001</strong> are available across all companies.
            Templates under other companies are visible only to that company.
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
