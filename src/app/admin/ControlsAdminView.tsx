"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { showToast } from "@/components/Toast";

type Control = {
  id: string; name: string; statement: string; controlType: string;
  processAreaId: string; processArea?: { name: string; standardRef?: { standard: string } | null } | null;
  companyId?: string | null; knowledge?: string | null;
  practiceDocument?: string | null;
  csfWho?: string | null; csfWhat?: string | null; csfWhen?: string | null;
  csfWhere?: string | null; csfWhy?: string | null; csfHow?: string | null; csfEvidence?: string | null;
  controlOwner?: string | null; assuranceCadence?: string | null; effectivenessCriteria?: string | null;
  controlRef?: string | null; sourceFile?: string | null; controlTypeDetail?: string | null;
  standard?: string | null; isHsseCritical?: boolean | null;
  ramRating?: string | null; riskWeight?: number | null; rawHealthScore?: number | null;
  lastTestedDate?: string | null; lastTestResult?: string | null;
  keyActivities?: string | null; riskAddressed?: string | null; testingApproach?: string | null;
  uncertainFlags?: string | null; createdAt?: string | null;
};

type ControlForm = {
  name: string; statement: string; controlType: string;
  processAreaId: string; companyId: string; knowledge: string; practiceDocument: string;
  csfWho: string; csfWhat: string; csfWhen: string; csfWhere: string; csfWhy: string; csfHow: string; csfEvidence: string;
  controlOwner: string; assuranceCadence: string; effectivenessCriteria: string;
  controlRef: string; sourceFile: string; controlTypeDetail: string; standard: string; isHsseCritical: boolean;
  ramRating: string; riskWeight: number; rawHealthScore: number;
  lastTestedDate: string; lastTestResult: string;
  keyActivities: string; riskAddressed: string; testingApproach: string; uncertainFlags: string;
};

type ProcessArea = { id: string; name: string };

const NONE = (x: string | null | undefined) => x || <span className="text-slate-300 italic">—</span>;

function emptyForm(): ControlForm {
  return {
    name: "", statement: "", controlType: "Administrative", processAreaId: "", companyId: "", knowledge: "", practiceDocument: "",
    csfWho: "", csfWhat: "", csfWhen: "", csfWhere: "", csfWhy: "", csfHow: "", csfEvidence: "",
    controlOwner: "", assuranceCadence: "", effectivenessCriteria: "",
    controlRef: "", sourceFile: "", controlTypeDetail: "", standard: "", isHsseCritical: false,
    ramRating: "", riskWeight: 1, rawHealthScore: 80, lastTestedDate: "", lastTestResult: "",
    keyActivities: "", riskAddressed: "", testingApproach: "", uncertainFlags: ""
  };
}

function controlToForm(c: Control): ControlForm {
  return {
    name: c.name, statement: c.statement ?? "", controlType: c.controlType,
    processAreaId: c.processAreaId ?? "", companyId: c.companyId ?? "",
    knowledge: c.knowledge ?? "", practiceDocument: c.practiceDocument ?? "",
    csfWho: c.csfWho ?? "", csfWhat: c.csfWhat ?? "", csfWhen: c.csfWhen ?? "",
    csfWhere: c.csfWhere ?? "", csfWhy: c.csfWhy ?? "", csfHow: c.csfHow ?? "", csfEvidence: c.csfEvidence ?? "",
    controlOwner: c.controlOwner ?? "", assuranceCadence: c.assuranceCadence ?? "", effectivenessCriteria: c.effectivenessCriteria ?? "",
    controlRef: c.controlRef ?? "", sourceFile: c.sourceFile ?? "", controlTypeDetail: c.controlTypeDetail ?? "",
    standard: c.standard ?? "", isHsseCritical: c.isHsseCritical ?? false,
    ramRating: c.ramRating ?? "", riskWeight: c.riskWeight ?? 1, rawHealthScore: c.rawHealthScore ?? 80,
    lastTestedDate: c.lastTestedDate ?? "", lastTestResult: c.lastTestResult ?? "",
    keyActivities: c.keyActivities ?? "", riskAddressed: c.riskAddressed ?? "", testingApproach: c.testingApproach ?? "",
    uncertainFlags: c.uncertainFlags ?? ""
  };
}

export function ControlsAdminView({ initialControls, initialProcessAreas, isAdmin }: { initialControls: Control[]; initialProcessAreas: ProcessArea[]; isAdmin?: boolean }) {
  const [controls, setControls] = useState<Control[]>(initialControls);
  const [pas] = useState<ProcessArea[]>(initialProcessAreas);
  const [editing, setEditing] = useState<Control | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ControlForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "map2requirement">("details");
  const [selectedControlIds, setSelectedControlIds] = useState<Set<string>>(new Set());
  const [reqStandardFilter, setReqStandardFilter] = useState("");
  const [reqPAFilter, setReqPAFilter] = useState("");
  const [requirements, setRequirements] = useState<any[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState<number | null>(null);
  const [standardsList, setStandardsList] = useState<Array<{ id: string; standard: string }>>([]);

  const controlTypes = ["Administrative", "Procedural", "Analytical", "Behavioral", "Informational", "Engineering"];

  const filtered = useMemo(() => {
    if (!search.trim()) return controls;
    const t = search.toLowerCase();
    return controls.filter(c => c.name.toLowerCase().includes(t) || (c.processArea?.name ?? "").toLowerCase().includes(t) || c.controlType.toLowerCase().includes(t) || (c.practiceDocument ?? "").toLowerCase().includes(t));
  }, [controls, search]);

  const grouped = useMemo(() => {
    const byDoc = new Map<string, Control[]>();
    for (const c of filtered) { const docName = c.practiceDocument || "No Document"; if (!byDoc.has(docName)) byDoc.set(docName, []); byDoc.get(docName)!.push(c); }
    return [...byDoc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const selectControl = useCallback((c: Control) => { setSelectedControl(c); setIsEditingDetail(false); setForm(controlToForm(c)); }, []);
  const deselectControl = useCallback(() => { setSelectedControl(null); setIsEditingDetail(false); }, []);
  const startEditingDetail = useCallback(() => setIsEditingDetail(true), []);
  const cancelEditingDetail = useCallback(() => { if (selectedControl) setForm(controlToForm(selectedControl)); setIsEditingDetail(false); }, [selectedControl]);
  const openAdd = () => { setAdding(true); setForm(emptyForm()); };
  const closeModal = useCallback(() => { setEditing(null); setAdding(false); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const isUpdate = !!(editing || isEditingDetail);
      const targetId = editing?.id ?? selectedControl?.id;
      const url = isUpdate ? `/api/admin/controls/${targetId}` : "/api/admin/controls";
      const res = await fetch(url, { method: isUpdate ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (isUpdate) { setControls(prev => prev.map(cc => cc.id === targetId ? data.control : cc)); if (targetId === selectedControl?.id) { setSelectedControl(data.control); setIsEditingDetail(false); } }
      else setControls(prev => [...prev, data.control]);
      showToast(isUpdate ? "Updated" : "Created", "success"); setEditing(null); setAdding(false);
    } catch { showToast("Failed to save", "error"); } finally { setSaving(false); }
  };

  const toggleControlCheckbox = useCallback((controlId: string) => { setSelectedControlIds(prev => { const next = new Set(prev); if (next.has(controlId)) next.delete(controlId); else next.add(controlId); return next; }); }, []);
  const selectAllFiltered = useCallback(() => setSelectedControlIds(new Set(filtered.map(c => c.id))), [filtered]);
  const deselectAll = useCallback(() => setSelectedControlIds(new Set()), []);

  useEffect(() => { const cid = controls[0]?.companyId; fetch(`/api/admin/standards-list${cid ? `?companyId=${cid}` : ""}`).then(r => r.json()).then(d => setStandardsList(d.standards || [])).catch(() => {}); }, [controls]);
  useEffect(() => {
    if (activeTab !== "map2requirement") return; setReqLoading(true);
    const p = new URLSearchParams(); const cid = controls[0]?.companyId;
    if (cid) p.set("companyId", cid); if (reqStandardFilter) p.set("standard", reqStandardFilter); if (reqPAFilter) p.set("processAreaId", reqPAFilter);
    fetch(`/api/admin/requirements?${p.toString()}`).then(r => r.json()).then(d => { setRequirements(d.requirements || []); setReqLoading(false); }).catch(() => setReqLoading(false));
  }, [activeTab, reqStandardFilter, reqPAFilter, controls]);

  const handleMapToRequirement = async (rId: number) => {
    if (selectedControlIds.size === 0) { showToast("Select at least one control", "error"); return; }
    setMappingSaving(rId);
    try {
      const res = await fetch("/api/admin/map-control-requirement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ controlIds: [...selectedControlIds], requirementRId: rId }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Failed");
      showToast(`Mapped ${data.created} control(s)${data.skipped > 0 ? ` (${data.skipped} already mapped)` : ""}`, "success");
      const p = new URLSearchParams(); const cid = controls[0]?.companyId; if (cid) p.set("companyId", cid); if (reqStandardFilter) p.set("standard", reqStandardFilter); if (reqPAFilter) p.set("processAreaId", reqPAFilter);
      setRequirements((await (await fetch(`/api/admin/requirements?${p.toString()}`)).json()).requirements || []);
      setSelectedControlIds(new Set());
    } catch (e: any) { showToast(e.message || "Failed to map", "error"); } finally { setMappingSaving(null); }
  };

  const controlList = (
    <div className="flex-1 overflow-y-auto px-1 py-1">
      {grouped.map(([docName, ctrls]) => (
        <CollapsibleSection key={docName} title={docName} count={ctrls.length} defaultOpen={false}>
          <div className="space-y-0.5">
            {ctrls.map(c => (
              activeTab === "map2requirement" ? (
                <label key={c.id} className={`w-full flex items-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer ${selectedControlIds.has(c.id) ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"}`}>
                  <input type="checkbox" checked={selectedControlIds.has(c.id)} onChange={() => toggleControlCheckbox(c.id)} className="shrink-0 rounded" />
                  <span className="truncate flex-1 min-w-0 font-medium text-slate-700">{c.name}</span>
                  <span className="ml-1 shrink-0 text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{c.controlType}</span>
                </label>
              ) : (
                <button key={c.id} onClick={() => selectControl(c)} className={`w-full text-left flex items-center justify-between py-1 px-2 rounded text-xs ${selectedControl?.id === c.id ? "bg-blue-50 border border-blue-200 text-blue-800" : "hover:bg-slate-50 text-slate-700 border border-transparent"}`}>
                  <span className="truncate flex-1 min-w-0 font-medium">{c.name}</span>
                  <span className={`ml-1 shrink-0 text-[10px] px-1 py-0.5 rounded ${selectedControl?.id === c.id ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{c.controlType}</span>
                </button>
              )
            ))}
          </div>
        </CollapsibleSection>
      ))}
      {grouped.length === 0 && <p className="text-xs text-slate-400 py-8 text-center">No controls found.</p>}
    </div>
  );

  return (
    <div>
      <div className="flex items-center border-b border-slate-200 mb-0">
        <button onClick={() => { setActiveTab("details"); setSelectedControl(null); setIsEditingDetail(false); }} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "details" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>Details</button>
        <button onClick={() => { setActiveTab("map2requirement"); setSelectedControl(null); setIsEditingDetail(false); }} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "map2requirement" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>Map2Requirement</button>
      </div>
      <div className="flex gap-0 h-[70vh]">
        <div className="w-2/5 border-r border-slate-200 flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 shrink-0">
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs" />
            <span className="text-[10px] text-slate-400 shrink-0">{filtered.length}/{controls.length}</span>
            {activeTab === "details" && <Button variant="primary" size="sm" onClick={openAdd}>+</Button>}
          </div>
          {activeTab === "map2requirement" && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 shrink-0 bg-slate-50">
              <span className="text-[10px] text-slate-500">{selectedControlIds.size} selected</span>
              <div className="flex gap-1"><button onClick={selectAllFiltered} className="text-[10px] text-blue-600 hover:text-blue-800">All</button><span className="text-slate-300">|</span><button onClick={deselectAll} className="text-[10px] text-blue-600 hover:text-blue-800">None</button></div>
            </div>
          )}
          {controlList}
        </div>
        <div className="w-3/5 flex flex-col min-w-0">
          {activeTab === "details" ? (
            selectedControl === null ? (
              <div className="flex-1 flex items-center justify-center text-slate-400"><div className="text-center"><div className="text-4xl mb-2">📋</div><p className="text-sm">Select a control from the list</p><p className="text-xs text-slate-300 mt-1">to view and edit its details</p></div></div>
            ) : isEditingDetail ? (
              <EditForm form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={cancelEditingDetail} pas={pas} controlTypes={controlTypes} isAdmin={isAdmin} />
            ) : (
              <DetailView c={selectedControl!} isAdmin={isAdmin} onEdit={startEditingDetail} onClose={deselectControl} />
            )
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex gap-2 px-3 py-2 border-b border-slate-200 shrink-0">
                <select value={reqStandardFilter} onChange={e => setReqStandardFilter(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"><option value="">All Standards</option>{standardsList.map(s => <option key={s.id} value={s.id}>{s.standard}</option>)}</select>
                <select value={reqPAFilter} onChange={e => setReqPAFilter(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"><option value="">All Process Areas</option>{pas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {reqLoading ? <div className="flex items-center justify-center py-12"><div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>
                : requirements.length === 0 ? <p className="text-xs text-slate-400 py-8 text-center">{reqStandardFilter || reqPAFilter ? "No requirements match the filters." : "Select a standard or process area to see requirements."}</p>
                : <div className="divide-y divide-slate-100">{requirements.map((req: any) => (
                  <div key={req.rId} className="px-3 py-2 hover:bg-slate-50 text-xs"><div className="flex items-start justify-between gap-2"><div className="flex-1 min-w-0">
                    <p className="text-slate-800 font-medium truncate">{req.requirementId}</p><p className="text-slate-600 mt-0.5 line-clamp-2">{req.clauseContent}</p>
                    <div className="flex gap-2 mt-1 text-[10px] text-slate-400">{req.standard && <span>{req.standard}</span>}{req.processAreaName && <span>· {req.processAreaName}</span>}<span className="text-blue-500 font-medium">· {req.mappedControlCount} control{req.mappedControlCount !== 1 ? "s" : ""}</span></div>
                  </div>
                  <button onClick={() => handleMapToRequirement(req.rId)} disabled={mappingSaving === req.rId || selectedControlIds.size === 0} className="shrink-0 text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium">{mappingSaving === req.rId ? "…" : "+map here"}</button></div></div>
                ))}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
      <Modal isOpen={!!(editing || adding)} onClose={closeModal} title={editing ? "Edit Control" : "Add Control"}>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <F label="Name"><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></F>
          <F label="Statement"><textarea value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3} /></F>
          <F label="Control Type"><select value={form.controlType} onChange={e => setForm({ ...form, controlType: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">{controlTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></F>
          <F label="Process Area"><select value={form.processAreaId} onChange={e => setForm({ ...form, processAreaId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"><option value="">— None —</option>{pas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
          <F label="Company ID"><input type="text" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="comp_…" /></F>
          {isAdmin && <F label="🔒 Knowledge (Admin only)"><textarea value={form.knowledge} onChange={e => setForm({ ...form, knowledge: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={4} /></F>}
          <div className="flex gap-2 mt-4 justify-end"><Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button><Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-slate-600">{label}</label>{children}</div>;
}

function DetailView({ c, isAdmin, onEdit, onClose }: { c: Control; isAdmin?: boolean; onEdit: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 shrink-0">
        <h3 className="text-sm font-semibold text-slate-800 truncate">{c.name}</h3>
        <div className="flex items-center gap-2 shrink-0"><span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{c.controlType}</span><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3"><dl className="space-y-3 text-sm">
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">Name</dt><dd className="text-slate-800">{c.name}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">ID</dt><dd className="text-slate-800 font-mono text-[10px]">{c.id}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">Statement</dt><dd className="text-slate-800 whitespace-pre-wrap">{c.statement || <i className="text-slate-300">No statement</i>}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">Control Type</dt><dd className="text-slate-800">{c.controlType}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">Process Area</dt><dd className="text-slate-800">{c.processAreaId ? `${c.processArea?.name ?? c.processAreaId}${c.processArea?.standardRef?.standard ? ` (${c.processArea.standardRef.standard})` : ""}` : <i className="text-slate-300">None</i>}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">Practice Document</dt><dd className="text-slate-800">{c.practiceDocument || <i className="text-slate-300">None</i>}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500 mb-0.5">Company</dt><dd className="text-slate-800 font-mono text-xs">{c.companyId || <i className="text-slate-300">None</i>}</dd></div>
        {isAdmin && <div><dt className="text-xs font-medium text-slate-500 mb-0.5">🔒 Knowledge</dt><dd className="text-slate-800 whitespace-pre-wrap">{c.knowledge || <i className="text-slate-300">No knowledge notes</i>}</dd></div>}
        <CSFSec label="CSF Who-What-When-Where-Why-How" c={c} />
        <CSFExt label="CSF v2.0 Extended" c={c} />
        <MetaSec c={c} />
        <RiskSec c={c} />
      </dl></div>
      <div className="flex gap-2 px-4 py-2 border-t border-slate-200 shrink-0 justify-end"><Button variant="primary" size="sm" onClick={onEdit}><svg className="w-3.5 h-3.5 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>Edit</Button></div>
    </div>
  );
}

function EditForm({ form, setForm, saving, onSave, onCancel, pas, controlTypes, isAdmin }: any) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 shrink-0"><h3 className="text-sm font-semibold text-slate-800">Edit Control</h3><button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      <div className="flex-1 overflow-y-auto px-4 py-3"><div className="space-y-3">
        <F label="Name"><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></F>
        <F label="Statement"><textarea value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3} /></F>
        <F label="Control Type"><select value={form.controlType} onChange={e => setForm({ ...form, controlType: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">{controlTypes.map((t: string) => <option key={t} value={t}>{t}</option>)}</select></F>
        <F label="Process Area"><select value={form.processAreaId} onChange={e => setForm({ ...form, processAreaId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"><option value="">— None —</option>{pas.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
        <F label="Practice Document"><input type="text" value={form.practiceDocument} onChange={e => setForm({ ...form, practiceDocument: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></F>
        <F label="Company ID"><input type="text" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></F>
        <div className="border-t border-slate-200 pt-3"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Metadata</p><div className="grid grid-cols-2 gap-2">
          <F label="Control Ref"><input type="text" value={form.controlRef} onChange={e => setForm({ ...form, controlRef: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Source File"><input type="text" value={form.sourceFile} onChange={e => setForm({ ...form, sourceFile: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Standard"><input type="text" value={form.standard} onChange={e => setForm({ ...form, standard: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Type Detail"><input type="text" value={form.controlTypeDetail} onChange={e => setForm({ ...form, controlTypeDetail: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
        </div><label className="flex items-center gap-2 text-xs font-medium text-slate-500 mt-2"><input type="checkbox" checked={form.isHsseCritical} onChange={e => setForm({ ...form, isHsseCritical: e.target.checked })} className="rounded" /> HSSE Critical</label></div>
        <div className="border-t border-slate-200 pt-3"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Risk &amp; Testing</p><div className="grid grid-cols-2 gap-2">
          <F label="RAM Rating"><input type="text" value={form.ramRating} onChange={e => setForm({ ...form, ramRating: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Risk Weight"><input type="number" value={form.riskWeight} onChange={e => setForm({ ...form, riskWeight: Number(e.target.value) })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Health Score"><input type="number" value={form.rawHealthScore} onChange={e => setForm({ ...form, rawHealthScore: Number(e.target.value) })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Last Tested"><input type="text" value={form.lastTestedDate} onChange={e => setForm({ ...form, lastTestedDate: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <div className="col-span-2"><F label="Last Test Result"><input type="text" value={form.lastTestResult} onChange={e => setForm({ ...form, lastTestResult: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F></div>
        </div><div className="space-y-2 mt-2">
          <F label="Key Activities"><textarea value={form.keyActivities} onChange={e => setForm({ ...form, keyActivities: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
          <F label="Risk Addressed"><textarea value={form.riskAddressed} onChange={e => setForm({ ...form, riskAddressed: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
          <F label="Testing Approach"><textarea value={form.testingApproach} onChange={e => setForm({ ...form, testingApproach: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
          <F label="Uncertain Flags"><input type="text" value={form.uncertainFlags} onChange={e => setForm({ ...form, uncertainFlags: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
        </div></div>
        <div className="border-t border-slate-200 pt-3"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">CSF Who-What-When-Where-Why-How</p><div className="space-y-2">
          <F label="Who"><input type="text" value={form.csfWho} onChange={e => setForm({ ...form, csfWho: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="What"><textarea value={form.csfWhat} onChange={e => setForm({ ...form, csfWhat: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
          <F label="When"><input type="text" value={form.csfWhen} onChange={e => setForm({ ...form, csfWhen: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Where"><input type="text" value={form.csfWhere} onChange={e => setForm({ ...form, csfWhere: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Why"><textarea value={form.csfWhy} onChange={e => setForm({ ...form, csfWhy: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
          <F label="How"><textarea value={form.csfHow} onChange={e => setForm({ ...form, csfHow: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={3} /></F>
          <F label="Evidence"><textarea value={form.csfEvidence} onChange={e => setForm({ ...form, csfEvidence: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
        </div></div>
        <div className="border-t border-slate-200 pt-3"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">CSF v2.0 Extended</p><div className="space-y-2">
          <F label="Control Owner (RASCI A)"><input type="text" value={form.controlOwner} onChange={e => setForm({ ...form, controlOwner: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Assurance Cadence"><input type="text" value={form.assuranceCadence} onChange={e => setForm({ ...form, assuranceCadence: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" /></F>
          <F label="Effectiveness Criteria"><textarea value={form.effectivenessCriteria} onChange={e => setForm({ ...form, effectivenessCriteria: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" rows={2} /></F>
        </div></div>
        {isAdmin && <F label="🔒 Knowledge (Admin only)"><textarea value={form.knowledge} onChange={e => setForm({ ...form, knowledge: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={4} /></F>}
      </div></div>
      <div className="flex gap-2 px-4 py-2 border-t border-slate-200 shrink-0 justify-end"><Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button variant="primary" size="sm" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</Button></div>
    </div>
  );
}

function CSFSec({ label, c }: { label: string; c: Control }) {
  return <div className="border-t border-slate-200 pt-3 mt-1"><dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</dt><div className="space-y-2">
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Who</dd><dd className="text-slate-800 text-xs">{NONE(c.csfWho)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">What</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{NONE(c.csfWhat)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">When</dd><dd className="text-slate-800 text-xs">{NONE(c.csfWhen)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Where</dd><dd className="text-slate-800 text-xs">{NONE(c.csfWhere)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Why</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{NONE(c.csfWhy)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">How</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{NONE(c.csfHow)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Evidence</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{NONE(c.csfEvidence)}</dd></div>
  </div></div>;
}

function CSFExt({ label, c }: { label: string; c: Control }) {
  return <div className="border-t border-slate-200 pt-3 mt-1"><dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</dt><div className="space-y-2">
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Control Owner (RASCI "A")</dd><dd className="text-slate-800 text-xs">{NONE(c.controlOwner)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Assurance Cadence</dd><dd className="text-slate-800 text-xs">{NONE(c.assuranceCadence)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Effectiveness Criteria</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{NONE(c.effectivenessCriteria)}</dd></div>
  </div></div>;
}

function MetaSec({ c }: { c: Control }) {
  return <div className="border-t border-slate-200 pt-3 mt-1"><dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Metadata</dt><div className="grid grid-cols-2 gap-x-4 gap-y-2">
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Control Ref</dd><dd className="text-slate-800 text-xs">{NONE(c.controlRef)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Source File</dd><dd className="text-slate-800 text-xs">{NONE(c.sourceFile)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Standard</dd><dd className="text-slate-800 text-xs">{NONE(c.standard)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Type Detail</dd><dd className="text-slate-800 text-xs">{NONE(c.controlTypeDetail)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">HSSE Critical</dd><dd className="text-slate-800 text-xs">{c.isHsseCritical ? <span className="text-red-600 font-semibold">⚠ Yes</span> : <span className="text-slate-400">No</span>}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Created</dd><dd className="text-slate-800 text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : <span className="text-slate-300 italic">—</span>}</dd></div>
  </div></div>;
}

function RiskSec({ c }: { c: Control }) {
  return <div className="border-t border-slate-200 pt-3 mt-1"><dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Risk &amp; Testing</dt><div className="grid grid-cols-2 gap-x-4 gap-y-2">
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">RAM Rating</dd><dd className="text-slate-800 text-xs">{NONE(c.ramRating)}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Risk Weight</dd><dd className="text-slate-800 text-xs">{c.riskWeight ?? <span className="text-slate-300 italic">—</span>}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Health Score</dd><dd className="text-slate-800 text-xs">{c.rawHealthScore ?? <span className="text-slate-300 italic">—</span>}</dd></div>
    <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Last Tested</dd><dd className="text-slate-800 text-xs">{NONE(c.lastTestedDate)}</dd></div>
    <div className="col-span-2"><dd className="text-[10px] font-medium text-slate-400 uppercase">Last Test Result</dd><dd className="text-slate-800 text-xs">{NONE(c.lastTestResult)}</dd></div>
  </div>{(c.keyActivities || c.riskAddressed || c.testingApproach || c.uncertainFlags) && <div className="mt-2 space-y-2">
    {c.keyActivities && <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Key Activities</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{c.keyActivities}</dd></div>}
    {c.riskAddressed && <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Risk Addressed</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{c.riskAddressed}</dd></div>}
    {c.testingApproach && <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Testing Approach</dd><dd className="text-slate-800 text-xs whitespace-pre-wrap">{c.testingApproach}</dd></div>}
    {c.uncertainFlags && <div><dd className="text-[10px] font-medium text-slate-400 uppercase">Uncertain Flags</dd><dd className="text-slate-800 text-xs">{c.uncertainFlags}</dd></div>}
  </div>}</div>;
}
