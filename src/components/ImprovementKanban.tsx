"use client";
import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

const PIP_COLUMNS = ["Proposed", "Approved", "InProgress", "Implemented", "Closed"] as const;
const COL_LABELS: Record<string, string> = { Proposed: "💡 Proposed", Approved: "✅ Approved", InProgress: "🔄 In Progress", Implemented: "✔️ Implemented", Closed: "📁 Closed" };
const COL_COLORS: Record<string, string> = { Proposed: "bg-slate-50", Approved: "bg-blue-50", InProgress: "bg-amber-50", Implemented: "bg-green-50", Closed: "bg-slate-100" };

type PipItem = any;

export function ImprovementKanban({ pipItems: initial, assessmentActions, processAreaId, isSpoOrAdmin }: { pipItems: PipItem[]; assessmentActions: any[]; processAreaId: string; isSpoOrAdmin: boolean }) {
  const [items, setItems] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState(5);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    const res = await fetch(`/api/admin/pip?processAreaId=${processAreaId}`);
    if (res.ok) setItems(await res.json());
  };

  const moveItem = async (id: string, newStatus: string) => {
    if (id.startsWith("action_")) return; // Assessment actions can't be moved
    await fetch(`/api/admin/pip/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipStatus: newStatus }) });
    await refresh();
  };

  const addItem = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/pip", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || null, processAreaId, priority: newPriority }),
    });
    if (res.ok) {
      setNewTitle(""); setNewDesc(""); setNewPriority(5); setShowAdd(false);
      await refresh();
    }
    setAdding(false);
  };

  const grouped = PIP_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: items.filter((i: any) => i.pipStatus === col) }), {} as Record<string, PipItem[]>);

  // Merge assessment actions (auto-synced, appear as Approved or Closed)
  const actionItems = (assessmentActions || []).map((a: any) => ({
    id: `action_${a.id}`,
    title: a.actionDescription || "Assessment Action",
    description: `Finding: ${a.findingDescription || ""}\nControl: ${a.controlName || ""}\nParty: ${a.actionParty || "—"}`,
    pipStatus: a.closureDate ? "Closed" : "Approved",
    priority: 0,
    _isAction: true,
    _actionId: a.id,
    _findingId: a.findingId,
    _assessmentId: a.assessmentId,
    _assessmentName: a.assessmentName,
    _targetDate: a.targetDate,
    _isClosed: !!a.closureDate,
    source: "Assessment Action",
    controlLinks: [{ control: { id: a.controlId, name: a.controlName } }],
  }));
  const allItems = [...items, ...actionItems];
  const groupedAll = PIP_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: allItems.filter((i: any) => i.pipStatus === col) }), {} as Record<string, PipItem[]>);

  if (!isSpoOrAdmin) {
    return (
      <div className="mt-6 space-y-6">
        <Card padding="md"><h3 className="text-sm font-semibold text-slate-700 mb-3">📈 Process Improvement Plan</h3>
          {allItems.length === 0 ? <p className="text-sm text-slate-400">No improvement items yet.</p> : (
            <div className="space-y-2">
              {allItems.map((item: any) => (
                <div key={item.id} className={`flex items-center justify-between border-b py-2 ${item._isAction ? (item._isClosed ? "border-slate-100" : "border-amber-100 bg-amber-50 -mx-2 px-2 rounded") : "border-slate-100"}`}>
                  <div>
                    <span className={`text-sm font-medium ${item._isClosed ? "text-slate-400 line-through" : ""}`}>{item.title}</span>
                    <span className="ml-2 text-xs text-slate-400">{COL_LABELS[item.pipStatus || "Proposed"]}</span>
                    {item._isAction && <a href={`/fla/${item._assessmentId}`} className="ml-2 text-xs text-blue-600 hover:underline">📋 View</a>}
                  </div>
                  <div className="text-xs text-slate-400">{item.controlLinks?.length || 0} controls</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">📈 Process Improvement Plan — Kanban</h2>
          <button onClick={() => setShowHelp(true)} className="text-xs text-blue-500 hover:underline">❓ How to use</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{allItems.length} item{allItems.length !== 1 ? "s" : ""}{actionItems.length > 0 ? ` (${actionItems.length} from assessments)` : ""}</span>
          <Button size="sm" variant="primary" onClick={() => setShowAdd(!showAdd)}>＋ Add Item</Button>
        </div>
      </div>

      {showAdd && (
        <Card padding="md" className="mb-4 border-blue-200 bg-blue-50">
          <div className="space-y-2">
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Improvement title (required)" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <textarea className="w-full border rounded px-3 py-2 text-sm" rows={2} placeholder="Description — what needs improving and why?" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Priority:</label>
              <select value={newPriority} onChange={e => setNewPriority(Number(e.target.value))} className="border rounded px-2 py-1 text-xs">
                <option value={10}>High</option><option value={5}>Medium</option><option value={1}>Low</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={addItem} disabled={adding || !newTitle.trim()}>{adding ? "Adding…" : "✓ Add to Proposed"}</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {PIP_COLUMNS.map(col => (
          <div key={col} className={`rounded-lg border border-slate-200 ${COL_COLORS[col]} p-2 min-h-[100px]`}>
            <div className="text-xs font-semibold text-slate-600 mb-2 px-1">{COL_LABELS[col]} ({groupedAll[col].length})</div>
            <div className="space-y-2">
              {groupedAll[col].map((item: any) => (
                <div key={item.id} className={`rounded border p-2 text-sm shadow-sm ${item._isAction ? (item._isClosed ? "bg-slate-100 border-slate-300 opacity-70" : "bg-amber-50 border-amber-200") : "bg-white border-slate-200"}`}>
                  <div className={`font-medium text-xs ${item._isClosed ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.title}</div>
                  {item.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{item.description}</div>}
                  {item._isAction ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <a href={`/fla/${item._assessmentId}`} className="text-xs text-blue-600 hover:underline" target="_blank">📋 {item._assessmentName || "Assessment"}</a>
                      <span className="text-xs text-slate-400">🔗 Assessment Action · {item._targetDate ? new Date(item._targetDate).toLocaleDateString() : "No target"}</span>
                      {isSpoOrAdmin && (
                        <select value={item.pipStatus || "Approved"} onChange={e => moveItem(item.id, e.target.value)}
                          className="text-xs border rounded px-1 py-0.5 bg-white mt-1">
                          {PIP_COLUMNS.map(c => <option key={c} value={c}>{COL_LABELS[c]}</option>)}
                        </select>
                      )}
                    </div>
                  ) : isSpoOrAdmin ? (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <select value={item.pipStatus || "Proposed"} onChange={e => moveItem(item.id, e.target.value)}
                        className="text-xs border rounded px-1 py-0.5 bg-white">
                        {PIP_COLUMNS.map(c => <option key={c} value={c}>{COL_LABELS[c]}</option>)}
                      </select>
                      {item.controlLinks?.length > 0 && <span className="text-xs text-slate-400">{item.controlLinks.length} ctrl</span>}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">📈 How to Use the PIP Kanban</h3>
              <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4 text-sm text-slate-600">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">What is the PIP Kanban?</h4>
                <p>The Process Improvement Plan helps Site Process Owners track improvement actions using a visual Kanban board — items move left to right as they progress.</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">5 Workflow Columns</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>💡 Proposed</strong> — Improvement identified, awaiting review.</li>
                  <li><strong>✅ Approved</strong> — SPO accepted. Ready to work on.</li>
                  <li><strong>🔄 In Progress</strong> — Work actively underway.</li>
                  <li><strong>✔️ Implemented</strong> — Change made. Verifying effectiveness.</li>
                  <li><strong>📁 Closed</strong> — Verified effective or rejected. Done.</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">Adding Items</h4>
                <p>Click <strong>＋ Add Item</strong>. Fill in a title (required), description, and priority. Items start in <strong>Proposed</strong>. Use the dropdown on each card to move it through columns.</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">MIC Statement</h4>
                <p>Use the <strong>Management in Control Statement</strong> on the Process Overview tab to document your overall assessment. Reference PIP outcomes and explain how barriers are being maintained.</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">ORCA Context</h4>
                <p>PIP is the <strong>Improvement</strong> output of the ORCA cycle (Objectives → Risk → Controls → Assurance). After reviewing controls health and assurance, PIP captures "what are we doing about it?"</p>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-100 text-right">
              <Button size="sm" variant="primary" onClick={() => setShowHelp(false)}>Got it</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
