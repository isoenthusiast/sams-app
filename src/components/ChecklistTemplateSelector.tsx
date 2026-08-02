"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  auditStandard: string;
  _count?: { items: number };
}

export function ChecklistTemplateSelector({
  assessmentId,
  onAdopted,
}: {
  assessmentId: string;
  onAdopted?: (count: number) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/assessments/checklist-templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => setError("Failed to load templates"));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const adopt = async () => {
    if (selected.size === 0) return;
    setAdopting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/adopt-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(`✅ ${data.created} checklist items adopted from ${data.templates} template(s)`);
      onAdopted?.(data.created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Adoption failed");
    } finally {
      setAdopting(false);
    }
  };

  if (result) {
    return <p className="text-sm text-emerald-700 py-2">{result}</p>;
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-sm font-medium text-slate-700">
          📋 Select Audit Checklist Template(s)
        </span>
        <span className="text-slate-400 text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && (
        <div className="px-4 py-3 space-y-3 border-t border-slate-200 bg-white">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {templates.map((t) => (
            <label key={t.id} className="flex items-start gap-2 cursor-pointer hover:bg-slate-50 rounded p-2">
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-slate-800">{t.name}</div>
                <div className="text-xs text-slate-500">{t.description}</div>
              </div>
            </label>
          ))}
          <button
            onClick={adopt}
            disabled={selected.size === 0 || adopting}
            className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
          >
            {adopting ? "Adopting…" : "Adopt Selected Checklist(s)"}
          </button>
        </div>
      )}
    </div>
  );
}
