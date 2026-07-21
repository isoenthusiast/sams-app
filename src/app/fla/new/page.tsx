"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";

export default function NewAssessmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [controls, setControls] = useState<any[]>([]);
  const [processAreas, setProcessAreas] = useState<any[]>([]);
  const [selectedPA, setSelectedPA] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/table/ProcessArea/data?perPage=200").then((r) => r.json()).then((d) =>
      setProcessAreas(d.rows || [])
    );
    fetch("/api/admin/table/Control/data?perPage=2000").then((r) => r.json()).then((d) =>
      setControls(
        (d.rows || []).sort((a: any, b: any) => a.name.localeCompare(b.name))
      )
    );
  }, []);

  const filtered = controls.filter((c: any) => {
    if (selectedPA && c.processAreaId !== selectedPA) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!name.trim()) { setError("Assessment name is required"); return; }
    if (checked.size === 0) { setError("Select at least one control"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), controlIds: Array.from(checked) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const assessment = await res.json();
      router.push(`/fla/${assessment.id}`);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">New Assessment</h1>

      <div className="space-y-4">
        <Card padding="sm">
          <Input label="Assessment Name" value={name} onChange={setName} required placeholder="e.g., Q3 Air Quality Assessment" />
        </Card>

        <Card title={`Select Controls (${checked.size} selected)`} padding="sm">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input type="text" placeholder="Search controls..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <Select
              options={[{ value: "", label: "All Process Areas" }, ...processAreas.map((pa: any) => ({ value: pa.id, label: pa.name }))]}
              value={selectedPA}
              onChange={setSelectedPA}
            />
            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set(filtered.map((c: any) => c.id)))}>Select All</Button>
            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())}>Clear</Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {filtered.map((c: any) => (
              <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-slate-50 text-sm ${checked.has(c.id) ? "bg-blue-50" : ""}`}>
                <input type="checkbox" checked={checked.has(c.id)}
                  onChange={() => { setChecked((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; }); }}
                  className="rounded text-blue-600" />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-slate-400">{c.controlType}</span>
              </label>
            ))}
          </div>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleCreate} disabled={saving} size="lg" variant="success">
          {saving ? "Creating…" : "✓ Create Assessment"}
        </Button>
      </div>
    </div>
  );
}
