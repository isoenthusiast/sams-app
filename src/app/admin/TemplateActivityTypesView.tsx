"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { showToast } from "@/components/Toast";

type Template = {
  id: string;
  name: string;
  description?: string | null;
  companyId?: string | null;
  activityTypes?: Array<{ activityTypeId: string; activityType: { id: string; name: string } }>;
};

type ActivityType = { id: string; name: string };

export function TemplateActivityTypesView({ templates: initialTemplates, activityTypes: initialActivityTypes }: { templates: Template[]; activityTypes: ActivityType[] }) {
  const [templates] = useState<Template[]>(initialTemplates);
  const [activityTypes] = useState<ActivityType[]>(initialActivityTypes);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const openModal = (template: Template) => {
    const existing = (template.activityTypes ?? []).map((a: any) => a.activityTypeId);
    setSelectedIds(new Set(existing));
    setSelectedTemplate(template);
  };

  const toggleType = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      // Save via dedicated API
      const res = await fetch(`/api/admin/template-activities/${selectedTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityTypeIds: [...selectedIds] }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Linkages updated", "success");
      setSelectedTemplate(null);
    } catch { showToast("Failed to update linkages", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-slate-700 mb-4">Assessment Templates — Activity Type Linkages</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map(t => (
          <div key={t.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-800 text-sm">{t.name}</div>
                {t.description && <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>}
                <div className="text-xs text-slate-400 mt-1">Company: {t.companyId ?? "—"}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openModal(t)}>Edit Activities</Button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!selectedTemplate} onClose={() => setSelectedTemplate(null)} title={`Edit Activities — ${selectedTemplate?.name ?? ""}`}>
          <p className="text-xs text-slate-500 mb-4">Select which activity types are auto-created when assessments use this template.</p>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {activityTypes.map(at => (
              <label key={at.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selectedIds.has(at.id)} onChange={() => toggleType(at.id)} className="rounded" />
                <span>{at.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
      </Modal>
    </div>
  );
}
