"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { RequirementCard } from "@/components/RequirementCard";
import { KnowledgebasePanel } from "@/components/KnowledgebasePanel";

type Props = {
  processArea: any;
  subProcesses: any[];
  assessments: any[];
  reqWithControls: any[];
  allControls: any[];
  currentUserName: string | null;
  currentUserRole: string | null;
  companyId: string | null;
  kbEntries: Array<{ kID: string; knowledgeName: string; knowledgeContent: string; remarks: string | null; createdDate: string; addedBy: string }>;
};

type ChatMsg = { role: "user" | "assistant"; content: string; controls?: Array<{ name: string; statement: string; controlType: string }> };

export default function ProcessDetailsClient(props: Props) {
  const { processArea, subProcesses, assessments, reqWithControls, allControls, currentUserName, currentUserRole, companyId, kbEntries } = props;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "requirements" | "assessments" | "knowledgebase">("overview");
  const [reqData, setReqData] = useState(reqWithControls);
  const [expandedReqs, setExpandedReqs] = useState<Set<number>>(new Set());
  const [mapMode, setMapMode] = useState(false);
  const [mapChecked, setMapChecked] = useState<Set<string>>(new Set());
  const [mapTarget, setMapTarget] = useState<number | null>(null);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapMsg, setMapMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [mapFilter, setMapFilter] = useState("");
  const [dragCtrlId, setDragCtrlId] = useState<string | null>(null);
  const [dragOverReqId, setDragOverReqId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Stats
  const totalControls = allControls.length;

  useEffect(() => { setReqData(reqWithControls); }, [reqWithControls]);

  const toggleReq = (rId: number) => {
    setExpandedReqs((prev) => { const n = new Set(prev); if (n.has(rId)) n.delete(rId); else n.add(rId); return n; });
  };

  // Mapping
  const handleMapAssign = async (targetReqRId?: number) => {
    const rId = targetReqRId ?? mapTarget;
    if (!rId || mapChecked.size === 0) return;
    setMapSaving(true);
    setMapMsg(null);
    const unmapped = reqData.find((r: any) => r.requirementId === "Unmapped Controls")?.controls || [];
    const targetName = reqData.find((r: any) => r.rId === rId)?.requirementId ?? "";
    let mapped = 0;
    for (const ctrlId of mapChecked) {
      const ctrl = unmapped.find((c: any) => c.id === ctrlId);
      if (!ctrl) continue;
      const res = await fetch(`/api/admin/table/MapControl2Requirement/data?controlId=${ctrlId}`);
      if (!res.ok) continue;
      const d = await res.json();
      const existing = (d.rows || []).find((r: any) => r.controlId === ctrlId);
      if (existing) {
        await fetch(`/api/admin/table/MapControl2Requirement/${existing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirementRId: rId }),
        });
      } else {
        const newId = `m2r_${Date.now()}_${ctrlId.slice(-6)}`;
        await fetch("/api/admin/table/MapControl2Requirement/data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: newId, controlId: ctrlId, requirementRId: rId }),
        });
      }
      mapped++;
    }
    setMapMsg({ type: "ok", text: `Mapped ${mapped} control(s) to "${targetName}".` });
    setMapChecked(new Set());
    setMapTarget(null);
    router.refresh();
    setMapSaving(false);
  };

  const handleDropControl = async (ctrlId: string, targetReqRId: number) => {
    if (!ctrlId) return;
    const sourceReq = reqData.find((r: any) => r.controls.some((c: any) => c.id === ctrlId));
    if (!sourceReq || sourceReq.rId === targetReqRId) return;
    const control = sourceReq.controls.find((c: any) => c.id === ctrlId);
    if (!control) return;
    // Optimistic update
    setReqData((prev) => prev.map((r: any) => {
      if (r.rId === sourceReq.rId) return { ...r, controls: r.controls.filter((c: any) => c.id !== ctrlId) };
      if (r.rId === targetReqRId) {
        if (r.controls.some((c: any) => c.id === ctrlId)) return r;
        return { ...r, controls: [...r.controls, control] };
      }
      return r;
    }));
    const res = await fetch(`/api/admin/table/MapControl2Requirement/data?controlId=${ctrlId}`);
    if (res.ok) {
      const d = await res.json();
      const existing = (d.rows || []).find((r: any) => r.controlId === ctrlId);
      if (existing) {
        await fetch(`/api/admin/table/MapControl2Requirement/${existing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirementRId: targetReqRId }),
        });
      }
    }
    router.refresh();
  };

  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    const userMsg: ChatMsg = { role: "user", content: msg };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatInput("");
    try {
      const res = await fetch("/api/chat/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          processAreaId: processArea.id,
          companyId,
          history: newHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: data.reply || "No response.",
        controls: data.controls || [],
      };
      setChatMessages([...newHistory, assistantMsg]);
    } catch {
      setChatMessages([...newHistory, { role: "assistant", content: "Error: Could not reach AI. Please try again." }]);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/setup/process-areas" className="text-sm text-blue-600 hover:underline">← Process Areas</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{processArea.name}</h1>
      <p className="text-sm text-slate-500">{(processArea as any).standard ?? (processArea as any).standardRef?.standard ?? ""}</p>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-slate-200">
        {(["overview", "requirements", "assessments", "knowledgebase"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setMapMode(false); }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t ? "border-slate-900 text-slate-900 bg-white" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {t === "overview" ? "Process Overview" : t === "requirements" ? "Requirements & Controls" : t === "assessments" ? "Assessments" : "Knowledgebase"}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: Overview ─── */}
      {activeTab === "overview" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <Card padding="sm"><div className="text-2xl font-bold">{totalControls}</div><div className="text-xs text-slate-500">Controls</div></Card>
          <Card padding="sm"><div className="text-2xl font-bold">{reqData.length}</div><div className="text-xs text-slate-500">Requirements</div></Card>
          <Card padding="sm"><div className="text-2xl font-bold">{assessments.length}</div><div className="text-xs text-slate-500">Assessments</div></Card>
          <Card padding="sm"><div className="text-2xl font-bold">{kbEntries.length}</div><div className="text-xs text-slate-500">KB Entries</div></Card>
        </div>
      )}

      {/* ─── TAB 2: Requirements & Controls ─── */}
      {activeTab === "requirements" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{reqData.length} requirement(s) · {reqData.reduce((s: number, r: any) => s + r.controls.length, 0)} linked control(s)</p>
            <Button
              variant={mapMode ? "primary" : "secondary"}
              size="sm"
              onClick={() => { setMapMode((p) => !p); setMapChecked(new Set()); setMapTarget(null); setMapMsg(null); }}
            >
              {mapMode ? "✕ Exit Map Mode" : "🗂 Map Controls"}
            </Button>
          </div>

          {mapMode ? (
            /* Map Mode: side-by-side */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Unmapped */}
              <Card className="border-amber-200 bg-amber-50" padding="sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-amber-900 text-sm">
                    📋 Unmapped ({(() => { const uc = reqData.find((r: any) => r.requirementId === "Unmapped Controls"); return uc ? uc.controls.length : 0; })()})
                  </h3>
                  <div className="flex gap-1 text-xs">
                    <button onClick={() => { const uc = reqData.find((r: any) => r.requirementId === "Unmapped Controls"); if (uc) setMapChecked(new Set(uc.controls.map((c: any) => c.id))); }} className="text-amber-700 hover:underline">All</button>
                    <span className="text-amber-400">|</span>
                    <button onClick={() => setMapChecked(new Set())} className="text-amber-700 hover:underline">Clear</button>
                  </div>
                </div>
                <input type="text" placeholder="Filter..." value={mapFilter} onChange={(e) => setMapFilter(e.target.value)} className="w-full rounded border border-amber-300 px-2 py-1 text-sm bg-white mb-2" />
                <div className="max-h-[50vh] overflow-y-auto space-y-1">
                  {(() => {
                    const uc = reqData.find((r: any) => r.requirementId === "Unmapped Controls");
                    if (!uc || uc.controls.length === 0) return <p className="text-sm text-amber-600 py-4 text-center">✅ All mapped!</p>;
                    const filtered = mapFilter ? uc.controls.filter((c: any) => c.name.toLowerCase().includes(mapFilter.toLowerCase())) : uc.controls;
                    return filtered.map((c: any) => (
                      <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-amber-100 text-sm ${mapChecked.has(c.id) ? "bg-amber-200" : ""}`}>
                        <input type="checkbox" checked={mapChecked.has(c.id)} onChange={() => { setMapChecked((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; }); }} className="rounded border-amber-400 text-amber-600" />
                        <span className="flex-1 whitespace-normal break-words">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.controlType}</span>
                      </label>
                    ));
                  })()}
                </div>
              </Card>
              {/* Right: Requirements */}
              <div className="space-y-2">
                <Card padding="sm">
                  <h3 className="font-semibold text-blue-900 text-sm mb-2">📋 Requirements</h3>
                  {mapChecked.size > 0 && <p className="text-xs text-blue-600 mb-2">{mapChecked.size} selected — click a requirement to assign</p>}
                  <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100">
                    {reqData.filter((r: any) => r.requirementId !== "Unmapped Controls").sort((a: any, b: any) => a.requirementId.localeCompare(b.requirementId)).map((req: any) => (
                      <button
                        key={req.rId}
                        onClick={() => { if (mapChecked.size > 0) handleMapAssign(req.rId); }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverReqId(req.rId); }}
                        onDragLeave={() => setDragOverReqId(null)}
                        onDrop={(e) => { e.preventDefault(); setDragOverReqId(null); if (dragCtrlId) handleDropControl(dragCtrlId, req.rId); }}
                        className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors ${dragOverReqId === req.rId ? "bg-blue-100" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">{req.requirementId} ({req.controls.length})</span>
                          {mapChecked.size > 0 && <span className="text-xs text-blue-600 font-medium">← Assign</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 whitespace-normal break-words">{req.clauseContent}</p>
                      </button>
                    ))}
                  </div>
                </Card>
                {mapChecked.size > 0 && (
                  <Card padding="sm" className="border-green-200 bg-green-50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-900">Assign to:</span>
                      <select value={mapTarget ?? ""} onChange={(e) => setMapTarget(e.target.value ? Number(e.target.value) : null)} className="rounded border border-green-300 px-2 py-1 text-sm flex-1">
                        <option value="">-- Select --</option>
                        {reqData.filter((r: any) => r.requirementId !== "Unmapped Controls").sort((a: any, b: any) => a.requirementId.localeCompare(b.requirementId)).map((r: any) => (
                          <option key={r.rId} value={r.rId}>{r.requirementId}</option>
                        ))}
                      </select>
                      <Button variant="success" size="sm" disabled={!mapTarget || mapSaving} onClick={() => handleMapAssign()}>{mapSaving ? "..." : "✓ Assign"}</Button>
                    </div>
                    {mapMsg && <p className={`text-xs mt-2 ${mapMsg.type === "ok" ? "text-green-700" : "text-red-600"}`}>{mapMsg.text}</p>}
                  </Card>
                )}
              </div>
            </div>
          ) : (
            /* Normal: requirement cards */
            reqData.map((req: any) => (
              <RequirementCard
                key={req.rId}
                req={req}
                isExpanded={expandedReqs.has(req.rId)}
                onToggle={() => toggleReq(req.rId)}
                onDropControl={handleDropControl}
                dragCtrlId={dragCtrlId}
                dragOverReqId={dragOverReqId}
                setDragCtrlId={setDragCtrlId}
                setDragOverReqId={setDragOverReqId}
                allReqs={reqData}
                onMoveControl={handleDropControl}
              />
            ))
          )}
        </div>
      )}

      {/* ─── TAB 3: Assessments ─── */}
      {activeTab === "assessments" && (
        <div className="mt-6 space-y-3">
          {assessments.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No assessments linked to this process area.</p>
          ) : (
            assessments.map((a: any) => (
              <Card key={a.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div>
                    <Link href={`/fla/${a.id}`} className="font-semibold text-blue-700 hover:underline">{a.name}</Link>
                    <div className="text-xs text-slate-500">{a.activityType?.name} · Assessor: {a.assessor?.name} · {new Date(a.startDate).toLocaleDateString()}</div>
                    <div className="text-xs text-slate-400">{a.samples?.length ?? 0} samples · {a.findings?.length ?? 0} findings</div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ─── TAB 4: Knowledgebase ─── */}
      {activeTab === "knowledgebase" && (
        <div className="mt-6 space-y-6">
          <KnowledgebasePanel entries={kbEntries} />

          {/* AI Chat */}
          <Card title="🤖 AI Assistant" subtitle="Ask questions about this process area. AI has access to the knowledgebase content above." padding="sm">
            <div className="max-h-[50vh] overflow-y-auto space-y-3 mb-4">
              {chatMessages.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  Ask a question about this process area, its controls, or the knowledgebase content.
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-800 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.controls && msg.controls.length > 0 && (
                      <div className="mt-2 border-t border-slate-300 pt-2">
                        <p className="text-xs font-medium mb-1">💡 Suggested Controls:</p>
                        {msg.controls.map((c, ci) => (
                          <div key={ci} className="text-xs mt-1 p-2 bg-white rounded border border-slate-200">
                            <div className="font-medium">{c.name}</div>
                            <div className="text-slate-500">{c.statement}</div>
                            <div className="text-blue-600 mt-0.5">{c.controlType}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about this process area…"
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                aria-label="Chat message"
              />
              <Button variant="primary" size="sm" type="submit" disabled={!chatInput.trim()}>
                Send
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
