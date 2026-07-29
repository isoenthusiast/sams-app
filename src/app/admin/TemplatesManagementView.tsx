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
  id: string; name: string; controlType: string; companyId?: string | null;
  processArea?: { id: string; name: string; standardRef?: { id: string; standard: string } | null } | null;
};
type Standard = { id: string; standard: string };
type ProcessArea = { id: string; name: string; standardRef?: { id: string; standard: string } | null };

type Template = {
  id: string; name: string; description?: string | null;
  companyId?: string | null;
  _count?: { controlLinkages?: number };
  controlLinkages?: Array<{ controlId: string; control: Control }>;
};

type Company = { id: string; companyID: string; companyName: string };
const SAMS_CUID = "comp_1783989395315";

export function TemplatesManagementView({
  templates: initialTemplates, activityTypes, allControls, allStandards, allProcessAreas,
  companies, selectedCompanyId, isAdmin,
}: {
  templates: any[]; activityTypes: any[]; allControls: Control[];
  allStandards: Standard[]; allProcessAreas: ProcessArea[];
  companies: Company[]; selectedCompanyId: string; isAdmin: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [activeTab, setActiveTab] = useState<string>("assessment");
  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selectedControlIds, setSelectedControlIds] = useState<Set<string>>(new Set());
  const [controlSearch, setControlSearch] = useState("");
  const [filterStandardId, setFilterStandardId] = useState<string>("");
  const [filterPAId, setFilterPAId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);

  // Company lookup
  const companyById = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);
  const getScopeLabel = (cid: string | null | undefined) => {
    if (!cid || cid === SAMS_CUID) return { label: "🌐 SAMS", cls: "text-blue-600" };
    const co = companyById.get(cid);
    return { label: co ? `🏢 ${co.companyID}` : "🏢", cls: "text-amber-600" };
  };
  // Can current user edit this template?
  const canEdit = (t: Template) => isAdmin || (!!t.companyId && t.companyId === selectedCompanyId);

  // Controls grouped by PA, respecting filters
  const filteredControlsByPA = useMemo(() => {
    const map = new Map<string, { paName: string; controls: Control[] }>();
    for (const c of allControls) {
      const pa = c.processArea;
      if (!pa) continue;
      // Standard filter
      if (filterStandardId && pa.standardRef?.id !== filterStandardId) continue;
      // PA filter
      if (filterPAId && pa.id !== filterPAId) continue;
      // Search filter
      if (controlSearch && !c.name.toLowerCase().includes(controlSearch.toLowerCase())) continue;
      const paId = pa.id;
      if (!map.has(paId)) map.set(paId, { paName: pa.name, controls: [] });
      map.get(paId)!.controls.push(c);
    }
    return [...map.entries()].sort((a, b) => a[1].paName.localeCompare(b[1].paName));
  }, [allControls, filterStandardId, filterPAId, controlSearch]);

  // PAs filtered by selected standard
  const filteredPAs = useMemo(() => {
    if (!filterStandardId) return allProcessAreas;
    return allProcessAreas.filter(pa => pa.standardRef?.id === filterStandardId);
  }, [allProcessAreas, filterStandardId]);

  // Selected controls for listing
  const selectedControls = useMemo(() => {
    return allControls.filter(c => selectedControlIds.has(c.id));
  }, [allControls, selectedControlIds]);

  // Group selected controls by PA
  const selectedByPA = useMemo(() => {
    const map = new Map<string, { paName: string; controls: Control[] }>();
    for (const c of selectedControls) {
      const paName = c.processArea?.name ?? "Unmapped";
      if (!map.has(paName)) map.set(paName, { paName, controls: [] });
      map.get(paName)!.controls.push(c);
    }
    return [...map.entries()].sort((a, b) => a[1].paName.localeCompare(b[1].paName));
  }, [selectedControls]);

  const openEdit = (t: Template) => {
    setEditing(t);
    setEditName(t.name);
    setEditDesc(t.description ?? "");
    const existingIds = (t.controlLinkages ?? []).map((l: any) => l.controlId);
    setSelectedControlIds(new Set(existingIds));
    setControlSearch("");
    setFilterStandardId("");
    setFilterPAId("");
  };

  const toggleControl = (id: string) => {
    setSelectedControlIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const removeControl = (id: string) => {
    setSelectedControlIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleShareWithGlobal = async () => {
    if (!editing) return;
    const nonSamsCount = [...selectedControlIds].filter(cid => {
      const c = allControls.find(x => x.id === cid);
      return c?.companyId && c.companyId !== SAMS_CUID;
    }).length;
    const msg = nonSamsCount > 0
      ? `Share "${editing.name}" to SAMS001? ${nonSamsCount} company-specific control(s) will be skipped. Only SAMS001 controls can be shared.`
      : `Share "${editing.name}" to SAMS001? This creates an independent copy visible to all companies.`;
    if (!confirm(msg)) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${editing.id}/share`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const cloned = await res.json();
      const skipped = cloned.skippedControls ?? 0;
      setTemplates(prev => [...prev, { ...cloned.template, _count: { controlLinkages: cloned.template.controlLinkages?.length ?? 0 } }]);
      showToast(skipped > 0
        ? `Shared to SAMS001 — ${skipped} company-specific control(s) skipped`
        : "Shared to SAMS001 — independent copy created", "success");
    } catch { showToast("Failed to share template", "error"); }
    finally { setSharing(false); }
  };

  const handleAdopt = async (templateId: string) => {
    if (!selectedCompanyId || selectedCompanyId === SAMS_CUID) {
      showToast("Switch to a non-SAMS company to adopt templates", "error"); return;
    }
    setAdoptingId(templateId);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${templateId}/adopt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCompanyId: selectedCompanyId }),
      });
      if (!res.ok) throw new Error("Failed");
      const cloned = await res.json();
      setTemplates(prev => [...prev, { ...cloned, _count: { controlLinkages: cloned.controlLinkages?.length ?? 0 } }]);
      showToast("Template adopted to your company", "success");
    } catch { showToast("Failed to adopt template", "error"); }
    finally { setAdoptingId(null); }
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
                  <div className="flex items-center gap-1 shrink-0">
                    {t.companyId === SAMS_CUID && !isAdmin && selectedCompanyId !== SAMS_CUID && (
                      <Button variant="secondary" size="sm" disabled={adoptingId === t.id} onClick={() => handleAdopt(t.id)}>
                        {adoptingId === t.id ? "…" : "📥 Adopt"}
                      </Button>
                    )}
                    {canEdit(t) && <Button variant="secondary" size="sm" onClick={() => openEdit(t)}>✏️ Edit</Button>}
                  </div>
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
        <div className="space-y-4 max-h-[75vh] overflow-y-auto">
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

          {/* ── Control Selection Container ── */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-800">🎛 Control Selection</h4>
              <span className="text-xs text-slate-500">{selectedControlIds.size} selected</span>
            </div>

            {/* Filter row */}
            <div className="flex gap-2 mb-3">
              <select value={filterStandardId} onChange={(e) => { setFilterStandardId(e.target.value); setFilterPAId(""); }}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Standards</option>
                {allStandards.map(s => <option key={s.id} value={s.id}>{s.standard}</option>)}
              </select>
              <select value={filterPAId} onChange={(e) => setFilterPAId(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Process Areas</option>
                {filteredPAs.map(pa => <option key={pa.id} value={pa.id}>{pa.name}</option>)}
              </select>
            </div>

            {/* Search */}
            <input type="text" value={controlSearch} onChange={(e) => setControlSearch(e.target.value)}
              placeholder="Search controls…"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs mb-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />

            {/* Control checkboxes */}
            <div className="border border-slate-200 rounded-md bg-white max-h-[30vh] overflow-y-auto divide-y divide-slate-100">
              {filteredControlsByPA.map(([paId, { paName, controls }]) => (
                <div key={paId} className="px-2 py-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase py-1 px-1">{paName}</div>
                  {controls.map(c => (
                    <label key={c.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedControlIds.has(c.id)} onChange={() => toggleControl(c.id)} className="rounded" />
                      <span className="flex-1 text-xs">{c.name}</span>
                      <span className={`text-xs ${getScopeLabel(c.companyId).cls}`}>{getScopeLabel(c.companyId).label}</span>
                      <span className="text-xs text-slate-400">{c.controlType}</span>
                    </label>
                  ))}
                </div>
              ))}
              {filteredControlsByPA.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">No controls match the current filters.</p>
              )}
            </div>
          </div>

          {/* ── Selected Controls Listing ── */}
          {selectedControls.length > 0 && (
            <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/50">
              <h4 className="text-sm font-semibold text-emerald-800 mb-2">✅ Selected Controls ({selectedControls.length})</h4>
              <div className="space-y-1 max-h-[25vh] overflow-y-auto">
                {selectedByPA.map(([paName, group]) => (
                  <div key={paName}>
                    <div className="text-xs font-medium text-emerald-700 mt-2 mb-1">{paName}</div>
                    {group.controls.map(c => (
                      <div key={c.id} className="flex items-center gap-2 py-0.5 px-1 text-xs text-slate-700 group">
                        <span className="flex-1">{c.name}</span>
                        <span className={`text-xs ${getScopeLabel(c.companyId).cls}`}>{getScopeLabel(c.companyId).label}</span>
                        <span className="text-slate-400">{c.controlType}</span>
                        <button onClick={() => removeControl(c.id)}
                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scoping note */}
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <strong>📋 Template Scoping:</strong> SAMS001 templates are shared across all companies. Company-specific templates are visible only to that company.
            <strong> Only SAMS001 controls can be shared</strong> — company-specific controls are skipped when cloning.
            {editing?.companyId && editing.companyId !== SAMS_CUID && (
              <div className="mt-2 pt-2 border-t border-blue-200">
                <Button variant="secondary" size="sm" disabled={sharing} onClick={handleShareWithGlobal}>
                  {sharing ? "Sharing…" : "📤 Share with Global"}
                </Button>
                <span className="ml-2 text-blue-600">Creates an independent SAMS001 copy</span>
              </div>
            )}
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
