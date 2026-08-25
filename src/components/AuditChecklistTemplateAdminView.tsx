"use client";

import { useEffect, useState } from "react";

interface TemplateItem {
  id: string;
  checklistItemId: string;
  checklistText: string;
  auditStandard: string;
  sortOrder: number;
  templateId: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  auditStandard: string;
  _count?: { items: number };
  items?: TemplateItem[];
  isGlobal?: boolean;
}

const STANDARDS = ["ISO9001", "ISO14001", "ISO45001", "PMS"];

export function AuditChecklistTemplateAdminView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", auditStandard: "ISO9001" });
  const [editId, setEditId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<Record<string, { checklistItemId: string; checklistText: string; sortOrder: number }>>({});
  const [error, setError] = useState<string | null>(null);
  // Edit item modal state
  const [editItem, setEditItem] = useState<TemplateItem | null>(null);
  const [editForm, setEditForm] = useState({ checklistItemId: "", checklistText: "", sortOrder: 0, keyQuestions: "", whatGoodLooksLike: "", controlPoints: "", evidenceRequirements: "" });
  // Filter: "all" | "global" | "local"
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "local">("all");
  const [adoptingId, setAdoptingId] = useState<string | null>(null);

  const handleAdopt = async (templateId: string) => {
    setAdoptingId(templateId);
    try {
      const res = await fetch(`/api/admin/audit-checklist-templates/${templateId}/adopt`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        if (res.status === 409) { setError("Already adopted"); }
        else { setError(d.error || "Failed to adopt"); }
        return;
      }
      loadTemplates();
    } catch {
      setError("Failed to adopt");
    } finally {
      setAdoptingId(null);
    }
  };

  const filteredTemplates = scopeFilter === "all"
    ? templates
    : templates.filter((t) => scopeFilter === "global" ? t.isGlobal : !t.isGlobal);

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/admin/assessments/checklist-templates");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch { /* */ }
    setLoading(false);
  };

  const loadItems = async (templateId: string) => {
    try {
      const res = await fetch(`/api/admin/audit-checklist-templates/${templateId}/items`);
      const data = await res.json();
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, items: Array.isArray(data) ? data : [] } : t))
      );
    } catch { /* */ }
  };

  useEffect(() => { loadTemplates(); }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { next.add(id); loadItems(id); }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setError(null);
    const res = await fetch("/api/admin/audit-checklist-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError("Failed to create"); return; }
    setShowAdd(false);
    setForm({ name: "", description: "", auditStandard: "ISO9001" });
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template and all its items?")) return;
    await fetch(`/api/admin/audit-checklist-templates/${id}`, { method: "DELETE" });
    loadTemplates();
  };

  const handleUpdateTemplate = async (id: string) => {
    const t = templates.find((t) => t.id === id);
    if (!t) return;
    const name = prompt("Template name:", t.name);
    if (!name) return;
    await fetch(`/api/admin/audit-checklist-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadTemplates();
  };

  const handleAddItem = async (templateId: string) => {
    const f = itemForm[templateId];
    if (!f?.checklistItemId?.trim() || !f?.checklistText?.trim()) {
      setError("Item ID and text are required");
      return;
    }
    setError(null);
    await fetch(`/api/admin/audit-checklist-templates/${templateId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setItemForm((prev) => { const n = { ...prev }; delete n[templateId]; return n; });
    loadItems(templateId);
  };

  const handleDeleteItem = async (templateId: string, itemId: string) => {
    if (!confirm("Delete this item?")) return;
    await fetch(`/api/admin/audit-checklist-templates/${templateId}/items/${itemId}`, { method: "DELETE" });
    loadItems(templateId);
  };

  const openEditItem = (item: TemplateItem) => {
    setEditItem(item);
    setEditForm({
      checklistItemId: item.checklistItemId,
      checklistText: item.checklistText,
      sortOrder: item.sortOrder,
      keyQuestions: (item as any).keyQuestions ?? "",
      whatGoodLooksLike: (item as any).whatGoodLooksLike ?? "",
      controlPoints: (item as any).controlPoints ?? "",
      evidenceRequirements: (item as any).evidenceRequirements ?? "",
    });
  };

  const handleSaveItem = async () => {
    if (!editItem) return;
    await fetch(`/api/admin/audit-checklist-templates/${editItem.templateId}/items/${editItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditItem(null);
    loadItems(editItem.templateId);
  };

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading templates…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">
            Audit Checklist Templates ({filteredTemplates.length})
          </h2>
          {/* Scope filter toggles */}
          <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-100 p-0.5">
            {([
              { key: "all", label: "All" },
              { key: "global", label: "🌐 Global" },
              { key: "local", label: "🏢 Local" },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setScopeFilter(f.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  scopeFilter === f.key
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditId(null); }}
          className="rounded-md bg-blue-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-900"
        >
          ＋ New Template
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}

      {/* Add/Edit Template Form */}
      {showAdd && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">New Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Name *</label>
              <input
                type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5"
                placeholder="ISO 9001:2015 Quality"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Standard</label>
              <select value={form.auditStandard} onChange={(e) => setForm({ ...form, auditStandard: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5">
                {STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <input
                type="text" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Create
            </button>
            <button onClick={() => { setShowAdd(false); setError(null); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template List */}
      <div className="space-y-2">
        {filteredTemplates.map((t) => {
          const isOpen = expanded.has(t.id);
          const isLocal = !t.isGlobal;
          return (
            <div key={t.id} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                <button onClick={() => toggleExpand(t.id)} className="flex items-center gap-2 text-left">
                  <span className="text-sm font-medium text-slate-800">{t.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${t.auditStandard === "ISO9001" ? "bg-blue-100 text-blue-700" : t.auditStandard === "ISO14001" ? "bg-emerald-100 text-emerald-700" : t.auditStandard === "ISO45001" ? "bg-amber-100 text-amber-700" : t.auditStandard === "PMS" ? "bg-slate-100 text-slate-600" : "bg-purple-100 text-purple-700"}`}>
                    {t.auditStandard}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.isGlobal ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                    {t.isGlobal ? "🌐 Global" : "🏢 Local"}
                  </span>
                  <span className="text-xs text-slate-400">({t._count?.items ?? t.items?.length ?? 0} items)</span>
                  <span className="text-slate-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                </button>
                <div className="flex items-center gap-1">
                  {t.isGlobal && (
                    <button
                      onClick={() => handleAdopt(t.id)}
                      disabled={adoptingId === t.id}
                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded border border-blue-200 hover:border-blue-400 disabled:opacity-50"
                      title="Copy to Local templates"
                    >
                      {adoptingId === t.id ? "…" : "📥 Copy to Local"}
                    </button>
                  )}
                  {isLocal && (
                    <>
                      <button onClick={() => handleUpdateTemplate(t.id)} className="text-xs text-blue-600 hover:text-blue-800 px-1">✏️</button>
                      <button onClick={() => handleDelete(t.id)} className="text-xs text-red-400 hover:text-red-600 px-1">🗑</button>
                    </>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="px-4 py-2 space-y-2">
                  {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  
                  {/* Items table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-1 pr-2 w-24">ID</th>
                        <th className="py-1 pr-2">Text</th>
                        <th className="py-1 pr-2 w-12">Order</th>
                        <th className="py-1 w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(t.items ?? []).map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1 pr-2 font-mono text-slate-600">{item.checklistItemId}</td>
                          <td className="py-1 pr-2 text-slate-700">{item.checklistText}</td>
                          <td className="py-1 pr-2 text-slate-400">{item.sortOrder}</td>
                          <td className="py-1">
                            <div className="flex items-center gap-1">
                              {isLocal && (
                                <>
                                  <button onClick={() => openEditItem(item)}
                                    className="text-xs text-blue-600 hover:text-blue-800">✏️ Edit</button>
                                  <button onClick={() => handleDeleteItem(t.id, item.id)}
                                    className="text-xs text-red-400 hover:text-red-600">×</button>
                                </>
                              )}
                              {!isLocal && (
                                <span className="text-xs text-slate-300" title="Global template items are read-only. Copy to Local to customize.">🔒 Read-only</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Add item form — only for local templates */}
                  {isLocal && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Item ID (e.g. QMS-7.1.5)"
                        value={itemForm[t.id]?.checklistItemId ?? ""}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, [t.id]: { ...prev[t.id], checklistItemId: e.target.value, checklistText: prev[t.id]?.checklistText ?? "", sortOrder: prev[t.id]?.sortOrder ?? (t.items?.length ?? 0) + 1 } }))}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Checklist text"
                        value={itemForm[t.id]?.checklistText ?? ""}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, [t.id]: { ...prev[t.id], checklistItemId: prev[t.id]?.checklistItemId ?? "", checklistText: e.target.value, sortOrder: prev[t.id]?.sortOrder ?? (t.items?.length ?? 0) + 1 } }))}
                        className="flex-[2] rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button onClick={() => handleAddItem(t.id)}
                        className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 shrink-0">
                        ＋ Add
                      </button>
                    </div>
                  )}
                  {!isLocal && (
                    <p className="text-xs text-slate-400 pt-1 italic">
                      📥 Use &quot;Copy to Local&quot; to create an editable copy for your company.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">
          {scopeFilter === "all" ? "No templates yet. Create one to get started." :
           scopeFilter === "global" ? "No global templates." : "No local templates. Copy a global template to get started."}
        </p>
      )}

      {/* Edit Item Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditItem(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              Edit Item: {editItem.checklistItemId}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Item ID</label>
                  <input type="text" value={editForm.checklistItemId}
                    onChange={(e) => setEditForm({ ...editForm, checklistItemId: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Sort Order</label>
                  <input type="number" value={editForm.sortOrder}
                    onChange={(e) => setEditForm({ ...editForm, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Checklist Text *</label>
                <textarea value={editForm.checklistText}
                  onChange={(e) => setEditForm({ ...editForm, checklistText: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Key Questions</label>
                <textarea value={editForm.keyQuestions}
                  onChange={(e) => setEditForm({ ...editForm, keyQuestions: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2}
                  placeholder="What should the auditor ask or look for?" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">What Good Looks Like</label>
                <textarea value={editForm.whatGoodLooksLike}
                  onChange={(e) => setEditForm({ ...editForm, whatGoodLooksLike: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2}
                  placeholder="Describe what compliant evidence looks like" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Control Points</label>
                <textarea value={editForm.controlPoints}
                  onChange={(e) => setEditForm({ ...editForm, controlPoints: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2}
                  placeholder="Specific control points or items to verify" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Evidence Requirements</label>
                <textarea value={editForm.evidenceRequirements}
                  onChange={(e) => setEditForm({ ...editForm, evidenceRequirements: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2}
                  placeholder="What evidence is needed?" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setEditItem(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSaveItem}
                className="rounded-md bg-blue-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-900">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
