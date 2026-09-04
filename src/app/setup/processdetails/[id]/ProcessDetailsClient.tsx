"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { RequirementCard } from "@/components/RequirementCard";
import { KnowledgebasePanel } from "@/components/KnowledgebasePanel";
import { ImprovementKanban } from "@/components/ImprovementKanban";
import DocumentsPanel, { type PaDocument } from "@/components/DocumentsPanel";
import { ControlTree, type StandardNode } from "@/components/ControlTree";
import { formatMarkdown } from "@/lib/formatMarkdown";

type Props = {
  processArea: any;
  subProcesses: any[];
  assessments: any[];
  reqWithControls: any[];
  allControls: any[];
  healthMetrics: {
    totalControls: number;
    healthDistribution: { effective: number; partiallyEffective: number; ineffective: number; neverTested: number };
    avgHealth: number | null;
    openFindings: number;
    overdueActions: number;
    totalAssessments: number;
    lastAssessment: { id: string; startDate: string; assessorName: string | null; name: string | null } | null;
  };
  requirementCoverage: { fully: number; partially: number; not: number; unset: number };
  pipItems: any[];
  assessmentActions: any[];
  currentUserName: string | null;
  currentUserRole: string | null;
  companyId: string | null;
  masterCompanyId: string;
  attestationStatus: { processAreaId: string; name: string; state: string; nextDue: string | null; lastAttestedAt: string | null; cadenceDays: number } | null;
  kbEntries: Array<{ kID: string; knowledgeName: string; knowledgeContent: string; remarks: string | null; createdDate: string; addedBy: string }>;
  documents: PaDocument[];
};

type PipProposal = { title: string; description: string; priority: string };
type ChatMsg = { role: "user" | "assistant"; content: string; controls?: Array<{ name: string; statement: string; controlType: string }>; proposedPips?: PipProposal[] };

export default function ProcessDetailsClient(props: Props) {
  const { processArea, subProcesses, assessments, reqWithControls, allControls, healthMetrics, requirementCoverage, pipItems, assessmentActions, currentUserName, currentUserRole, companyId, masterCompanyId, attestationStatus, kbEntries, documents } = props;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "requirements" | "assessments" | "knowledgebase" | "improvement" | "documents">("overview");
  const [pipData, setPipData] = useState(pipItems);
  const [showHowToRead, setShowHowToRead] = useState(false);
  const [editingMic, setEditingMic] = useState(false);
  const [micStatement, setMicStatement] = useState(processArea.micStatement || "");
  const [micSaving, setMicSaving] = useState(false);
  const [reqData, setReqData] = useState(reqWithControls);
  const [expandedReqs, setExpandedReqs] = useState<Set<number>>(new Set());
  const [mapMode, setMapMode] = useState(false);
  const [mapChecked, setMapChecked] = useState<Set<string>>(new Set());
  const [mapTarget, setMapTarget] = useState<number | null>(null);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapMsg, setMapMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [mapFilter, setMapFilter] = useState("");
  const [treeStandards, setTreeStandards] = useState<StandardNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [alreadyMappedIds, setAlreadyMappedIds] = useState<Set<string>>(new Set());
  const [dragCtrlId, setDragCtrlId] = useState<string | null>(null);
  const [dragOverReqId, setDragOverReqId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ── MIC Ritual (SAMS-014) attest modal state ──
  const canAttest = currentUserRole === "Admin" || currentUserRole === "Superuser" || currentUserRole === "Assessor";
  const [attestOpen, setAttestOpen] = useState(false);
  const [attestLoading, setAttestLoading] = useState(false);
  const [attestSigning, setAttestSigning] = useState(false);
  const [attestSnapshot, setAttestSnapshot] = useState<{ coveragePct: number | null; findingCount: number; overdueActionCount: number } | null>(null);
  const [attestStatus, setAttestStatus] = useState(attestationStatus);
  const [attestMsg, setAttestMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const openAttest = async () => {
    setAttestOpen(true);
    setAttestLoading(true);
    setAttestMsg(null);
    try {
      const res = await fetch(`/api/admin/processareas/${processArea.id}/attest`);
      if (res.ok) {
        const data = await res.json();
        setAttestSnapshot(data.snapshot);
        if (data.attestationStatus) setAttestStatus(data.attestationStatus);
      } else {
        const e = await res.json().catch(() => ({ error: "Failed to load snapshot" }));
        setAttestMsg({ type: "err", text: e.error });
      }
    } catch {
      setAttestMsg({ type: "err", text: "Failed to load snapshot" });
    } finally {
      setAttestLoading(false);
    }
  };

  const signAttest = async () => {
    setAttestSigning(true);
    setAttestMsg(null);
    try {
      const res = await fetch(`/api/admin/processareas/${processArea.id}/attest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setAttestSnapshot(data.snapshot);
        setAttestMsg({ type: "ok", text: "Attestation signed ✓" });
        // Refresh derived status + the server-rendered chips.
        const g = await fetch(`/api/admin/processareas/${processArea.id}/attest`);
        if (g.ok) {
          const gd = await g.json();
          if (gd.attestationStatus) setAttestStatus(gd.attestationStatus);
        }
        router.refresh();
        setTimeout(() => setAttestOpen(false), 1200);
      } else {
        const e = await res.json().catch(() => ({ error: "Failed to sign attestation" }));
        setAttestMsg({ type: "err", text: e.error });
      }
    } catch {
      setAttestMsg({ type: "err", text: "Failed to sign attestation" });
    } finally {
      setAttestSigning(false);
    }
  };

  const { healthDistribution, avgHealth, openFindings, overdueActions, totalAssessments, lastAssessment } = healthMetrics;
  const totalControls = healthMetrics.totalControls;
  const { effective, partiallyEffective, ineffective, neverTested } = healthDistribution;
  const testedTotal = effective + partiallyEffective + ineffective;
  const effectivePct = testedTotal > 0 ? Math.round((effective / testedTotal) * 100) : null;
  const covAssessed = requirementCoverage.fully + requirementCoverage.partially + requirementCoverage.not;
  const coveragePct = covAssessed > 0 ? Math.round((requirementCoverage.fully / covAssessed) * 100) : null;
  const isSpoOrAdmin = currentUserRole === "Admin" || currentUserRole === "Superuser";
  const isAdmin = currentUserRole === "Admin";

  // ── PIP helpers ──
  const refreshPips = async () => {
    const res = await fetch(`/api/admin/pip?processAreaId=${processArea.id}`);
    if (res.ok) setPipData(await res.json());
  };
  const movePip = async (pipId: string, newStatus: string) => {
    await fetch(`/api/admin/pip/${pipId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipStatus: newStatus }) });
    await refreshPips();
  };
  const saveMic = async () => {
    setMicSaving(true);
    await fetch(`/api/admin/pip/mic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ micStatement, processAreaId: processArea.id }) });
    setMicSaving(false); setEditingMic(false); router.refresh();
  };

  const speakMessage = (text: string, index: number) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speakingIndex === index) { setSpeakingIndex(null); return; }
    const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g, "").replace(/[*_#`~>|]/g, "").replace(/\n+/g, ". "));
    utterance.rate = 0.95;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Speech recognition not supported in this browser. Use Chrome or Edge."); return; }

    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setChatInput(prev => (prev + " " + transcript).trim());
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = (e: any) => {
        console.log("Speech recognition error:", e.error);
        setListening(false);
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (e: any) {
      console.log("Speech recognition start error:", e);
      setListening(false);
    }
  };

  useEffect(() => { setReqData(reqWithControls); }, [reqWithControls]);

  // Load control tree when Map Mode is entered
  useEffect(() => {
    if (!mapMode || treeStandards.length > 0) return;
    setTreeLoading(true);
    fetch("/api/admin/controls/tree")
      .then((r) => r.json())
      .then((data) => {
        if (data.standards) setTreeStandards(data.standards);
      })
      .catch(() => {})
      .finally(() => setTreeLoading(false));
  }, [mapMode, treeStandards.length]);

  // Compute already-mapped control IDs for the current PA
  useEffect(() => {
    if (!mapMode) return;
    const mapped = new Set<string>();
    for (const r of reqData) {
      if (r.requirementId === "Unmapped Controls") continue;
      for (const c of r.controls || []) {
        mapped.add(c.id);
      }
    }
    setAlreadyMappedIds(mapped);
  }, [mapMode, reqData]);

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

  const handleToggleMandatory = async (mcrId: string, next: boolean) => {
    const res = await fetch(`/api/admin/table/MapControl2Requirement/${mcrId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mandatory: next }),
    });
    if (res.ok) router.refresh();
  };

  const handleSaveSoc = async (rId: number, status: string | null, summary: string) => {
    const res = await fetch(`/api/admin/table/Requirement/${rId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socStatus: status, socSummary: summary }),
    });
    if (res.ok) router.refresh();
  };

  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg && !attachedFile) return;
    setChatInput("");
    setUploadingFile(true);

    let uploadedDoc: { documentId: string; filename: string; summary: string } | null = null;

    // Upload file first if attached
    if (attachedFile) {
      const formData = new FormData();
      formData.append("file", attachedFile);
      formData.append("processAreaId", processArea.id);
      if (companyId) formData.append("companyId", companyId);
      try {
        const uploadRes = await fetch("/api/chat/knowledge/upload", { method: "POST", body: formData });
        if (uploadRes.ok) uploadedDoc = await uploadRes.json();
      } catch { /* continue without file */ }
      setAttachedFile(null);
    }
    setUploadingFile(false);

    const userContent = msg || (uploadedDoc ? `I uploaded: ${uploadedDoc.filename}` : "");
    const userMsg: ChatMsg = { role: "user", content: userContent };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    try {
      const res = await fetch("/api/chat/knowledge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg || `Analyze the uploaded document: ${uploadedDoc?.filename || ""}`,
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
        proposedPips: data.proposedPips || [],
        _rawContent: data.reply || "",
      } as any;
      setChatMessages([...newHistory, assistantMsg]);
    } catch {
      setChatMessages([...newHistory, { role: "assistant", content: "Error: Could not reach AI. Please try again." }]);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/fla" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{processArea.name}</h1>
      <p className="text-sm text-slate-500">{(processArea as any).standard ?? (processArea as any).standardRef?.standard ?? ""}</p>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-slate-200">
        {(["overview", "requirements", "assessments", "knowledgebase", "documents", "improvement"] as const)
          .filter((t) => t !== "knowledgebase" || isAdmin)
          .map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setMapMode(false); }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t ? "border-slate-900 text-slate-900 bg-white" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {t === "overview" ? "Process Overview" : t === "requirements" ? "Requirements & Controls" : t === "assessments" ? "Assessments" : t === "knowledgebase" ? "Knowledgebase" : t === "documents" ? "📄 Documents" : "📈 Improvement"}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: Overview (ORCA) ─── */}
      {activeTab === "overview" && (
        <div className="mt-6 space-y-6">
          {/* O + R: Objectives & Risk row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card padding="md">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">🎯 Objectives</h3>
              <p className="text-sm text-slate-600">{processArea.description || "No description provided."}</p>
              <p className="text-xs text-slate-400 mt-1">Standard: {(processArea as any).standard ?? "—"}</p>
            </Card>
            <Card padding="md">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">⚠️ Risk</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-xl font-bold text-slate-900">{totalControls}</div><div className="text-xs text-slate-500">Total Controls</div></div>
                <div><div className="text-xl font-bold text-red-600">{ineffective}</div><div className="text-xs text-slate-500">Ineffective</div></div>
                <div><div className="text-xl font-bold text-amber-600">{allControls.filter((c: any) => (c as any).isHsseCritical).length}</div><div className="text-xs text-slate-500">HSSE Critical</div></div>
              </div>
            </Card>
          </div>

          {/* C + RC: Controls Health + Requirements Coverage donuts */}
          <div className="grid gap-4 lg:grid-cols-2">

          {/* C: Controls Health Donut */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">🛡 Controls Health</h3>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Donut */}
              <div className="relative w-40 h-40 flex-shrink-0">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                  {testedTotal > 0 && (() => {
                    const circumference = 2 * Math.PI * 48;
                    const effLen = (effective / testedTotal) * circumference;
                    const partLen = (partiallyEffective / testedTotal) * circumference;
                    const ineffLen = (ineffective / testedTotal) * circumference;
                    let offset = 0;
                    const segments = [];
                    if (effective > 0) { segments.push({ len: effLen, color: "#16a34a", offset }); offset += effLen; }
                    if (partiallyEffective > 0) { segments.push({ len: partLen, color: "#d97706", offset }); offset += partLen; }
                    if (ineffective > 0) { segments.push({ len: ineffLen, color: "#dc2626", offset }); }
                    return segments.map((s, i) => (
                      <circle key={i} cx="60" cy="60" r="48" fill="none" stroke={s.color} strokeWidth="12"
                        strokeDasharray={`${s.len} ${circumference - s.len}`} strokeDashoffset={-s.offset} strokeLinecap="round" />
                    ));
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900">{effectivePct !== null ? `${effectivePct}%` : "—"}</span>
                  <span className="text-xs text-slate-400">Effective</span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-600 inline-block"></span> Effective (≥80): <strong>{effective}</strong> controls</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Partially Effective (50–79): <strong>{partiallyEffective}</strong> controls</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span> Ineffective (&lt;50): <strong>{ineffective}</strong> controls</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-300 inline-block"></span> Never Tested: <strong>{neverTested}</strong> controls</div>
                {avgHealth !== null && <p className="text-xs text-slate-400 mt-1">Average health score: <strong>{avgHealth}%</strong> (tested controls only)</p>}
              </div>
            </div>
          </Card>

          {/* RC: Requirements Coverage (SOC) Donut */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">📊 Requirements Coverage</h3>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-40 h-40 flex-shrink-0">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                  {covAssessed > 0 && (() => {
                    const circumference = 2 * Math.PI * 48;
                    const fullyLen = (requirementCoverage.fully / covAssessed) * circumference;
                    const partLen = (requirementCoverage.partially / covAssessed) * circumference;
                    const notLen = (requirementCoverage.not / covAssessed) * circumference;
                    let offset = 0;
                    const segments = [];
                    if (requirementCoverage.fully > 0) { segments.push({ len: fullyLen, color: "#16a34a", offset }); offset += fullyLen; }
                    if (requirementCoverage.partially > 0) { segments.push({ len: partLen, color: "#d97706", offset }); offset += partLen; }
                    if (requirementCoverage.not > 0) { segments.push({ len: notLen, color: "#dc2626", offset }); }
                    return segments.map((s, i) => (
                      <circle key={i} cx="60" cy="60" r="48" fill="none" stroke={s.color} strokeWidth="12"
                        strokeDasharray={`${s.len} ${circumference - s.len}`} strokeDashoffset={-s.offset} strokeLinecap="round" />
                    ));
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900">{coveragePct !== null ? `${coveragePct}%` : "—"}</span>
                  <span className="text-xs text-slate-400">Coverage</span>
                </div>
              </div>
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-600 inline-block"></span> Fully Comply: <strong>{requirementCoverage.fully}</strong> requirements</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Partially Comply: <strong>{requirementCoverage.partially}</strong> requirements</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span> Not Comply: <strong>{requirementCoverage.not}</strong> requirements</div>
                {requirementCoverage.unset > 0 && (
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-300 inline-block"></span> Not Assessed: <strong>{requirementCoverage.unset}</strong> requirements</div>
                )}
                <p className="text-xs text-slate-400 mt-1">Coverage = % of requirements Fully Comply ({covAssessed} assessed)</p>
              </div>
            </div>
          </Card>
          </div>

          {/* A: Assurance */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">🔍 Assurance</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-slate-500">Last Assessment</div>
                <div className="text-sm font-medium text-slate-900" suppressHydrationWarning>
                  {lastAssessment ? new Date(lastAssessment.startDate).toLocaleDateString() : "Never"}
                </div>
                {lastAssessment?.assessorName && <div className="text-xs text-slate-400">by {lastAssessment.assessorName}</div>}
              </div>
              <div>
                <div className="text-xs text-slate-500">Assessments</div>
                <div className="text-sm font-medium text-slate-900">{totalAssessments} completed</div>
                <div className="text-xs text-slate-400">{reqWithControls.length} requirements · {totalControls} controls</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Findings & Actions</div>
                <div className="text-sm font-medium text-slate-900">{openFindings} open findings</div>
                {overdueActions > 0 && <div className="text-xs text-red-600 font-medium">{overdueActions} actions overdue</div>}
              </div>
            </div>
          </Card>

          {/* Improvement */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">📈 Improvement</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Open Findings</div>
                <div className="text-sm font-medium text-slate-900">{openFindings} finding{openFindings !== 1 ? "s" : ""} requiring action</div>
                {overdueActions > 0 && <div className="text-xs text-red-600 mt-1">{overdueActions} action{overdueActions !== 1 ? "s" : ""} overdue</div>}
              </div>
              <div>
                <div className="text-xs text-slate-500">Process Improvement Plan</div>
                <div className="text-sm text-slate-400">Coming soon — 0 improvement items</div>
              </div>
            </div>
          </Card>

          {/* MIC Statement */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">📝 Management in Control Statement</h3>
              {isSpoOrAdmin && !editingMic && (
                <button onClick={() => setEditingMic(true)} className="text-xs text-blue-600 hover:underline">✏️ Edit</button>
              )}
            </div>
            {editingMic ? (
              <div className="space-y-2">
                <textarea className="w-full border rounded px-3 py-2 text-sm" rows={4} value={micStatement}
                  onChange={e => setMicStatement(e.target.value)}
                  placeholder="Assess the overall state of management in control for this process. Reference ORCA: Are objectives clear? Are risks identified? Are controls healthy? Has assurance been conducted? What improvements are underway?" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="secondary" onClick={() => { setEditingMic(false); setMicStatement(processArea.micStatement || ""); }}>Cancel</Button>
                  <Button size="sm" variant="primary" onClick={saveMic} disabled={micSaving}>{micSaving ? "Saving…" : "Save"}</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{micStatement || "No MIC statement recorded yet. Site Process Owners should document their assessment of management in control for this process area."}</p>
            )}
            {processArea.micStatementUpdatedAt && <p className="text-xs text-slate-400 mt-1" suppressHydrationWarning>Last updated: {new Date(processArea.micStatementUpdatedAt).toLocaleDateString()}</p>}
          </Card>

          {/* MIC Ritual attestation (SAMS-014) */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">🗳 SOC Attestation</h3>
              {canAttest && (
                <button onClick={openAttest} className="text-xs font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-md px-3 py-1.5 inline-flex items-center gap-1">
                  ✍ Attest
                </button>
              )}
            </div>
            {attestStatus ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${attestStatus.state === "overdue" ? "bg-red-100 text-red-800" : attestStatus.state === "dueSoon" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                    {attestStatus.state === "overdue" ? "Overdue" : attestStatus.state === "dueSoon" ? "Due soon" : "Attested"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {attestStatus.state === "overdue" ? `was due ${new Date(attestStatus.nextDue ?? "").toLocaleDateString()}` : attestStatus.state === "dueSoon" ? `due ${new Date(attestStatus.nextDue ?? "").toLocaleDateString()}` : attestStatus.lastAttestedAt ? `last attested ${new Date(attestStatus.lastAttestedAt).toLocaleDateString()}` : "in date"}
                  </span>
                </div>
                {attestStatus.state === "overdue" && (
                  <p className="text-xs text-red-600">This process area's SOC attestation is overdue. Review the snapshot and sign below.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Attestation status unavailable for this process area.</p>
            )}
          </Card>

          {/* Attest modal */}
          {attestOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">Attest SOC snapshot — {processArea.name}</h3>
                  <button onClick={() => setAttestOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                </div>
                <div className="px-4 py-4 space-y-3">
                  {attestLoading ? (
                    <p className="text-sm text-slate-500">Computing server-side snapshot…</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">The server has computed the current SOC posture for this process area. Signing records it verbatim — a client-supplied snapshot is never trusted.</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg border border-slate-200 p-2">
                          <div className="text-xl font-bold text-slate-900">{attestSnapshot?.coveragePct === null || attestSnapshot?.coveragePct === undefined ? "—" : `${attestSnapshot.coveragePct}%`}</div>
                          <div className="text-[11px] text-slate-500">Coverage (full comply)</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-2">
                          <div className="text-xl font-bold text-slate-900">{attestSnapshot?.findingCount ?? "—"}</div>
                          <div className="text-[11px] text-slate-500">Open findings</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-2">
                          <div className="text-xl font-bold text-slate-900">{attestSnapshot?.overdueActionCount ?? "—"}</div>
                          <div className="text-[11px] text-slate-500">Overdue actions</div>
                        </div>
                      </div>
                      {attestMsg && (
                        <p className={`text-xs ${attestMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>{attestMsg.text}</p>
                      )}
                      <div className="flex justify-end gap-2 pt-1">
                        <Button size="sm" variant="secondary" onClick={() => setAttestOpen(false)} disabled={attestSigning}>Cancel</Button>
                        <Button size="sm" variant="primary" onClick={signAttest} disabled={attestSigning || attestLoading}>
                          {attestSigning ? "Signing…" : "Sign & attest"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* How to Read */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setShowHowToRead(!showHowToRead)} className="w-full text-left px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-between">
              📋 How to Read This Overview
              <span className="text-xs text-slate-400">{showHowToRead ? "▲" : "▼"}</span>
            </button>
            {showHowToRead && (
              <div className="px-4 py-3 text-xs text-slate-500 space-y-1 border-t border-slate-100">
                <p><strong>ORCA Framework:</strong> This page follows the Objectives → Risk → Controls → Assurance cycle used by Site Process Owners to demonstrate Management in Control.</p>
                <p><strong>Controls Health Donut:</strong> Shows the proportion of tested controls that are Effective (≥80%), Partially Effective (50–79%), or Ineffective (&lt;50%). Controls that have never been tested appear in grey.</p>
                <p><strong>Never Tested:</strong> Controls with a health score of 0 or null. The health reset mechanism resets untested controls to 0 — these need assessment coverage.</p>
                <p><strong>Assurance:</strong> Tracks when this process area was last formally assessed and whether findings are being closed. Overdue actions indicate gaps in the improvement cycle.</p>
                <p><strong>Improvement:</strong> The CI principle: &quot;If the process is not performing, it is either because the standard is not being followed, or needs improving.&quot; This section will track planned improvements.</p>
              </div>
            )}
          </div>
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
              <div className="space-y-3">
                {/* ── Control Tree ── */}
                <Card padding="sm">
                  <button
                    onClick={() => setTreeCollapsed(!treeCollapsed)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <h3 className="font-semibold text-slate-700 text-sm">
                      🌳 All Standards {treeLoading && <span className="text-xs text-slate-400 font-normal">(loading…)</span>}
                    </h3>
                    <span className="text-xs text-slate-400">{treeCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!treeCollapsed && (
                    <div className="mt-2">
                      <ControlTree
                        standards={treeStandards}
                        unmappedIds={mapChecked}
                        alreadyMappedIds={alreadyMappedIds}
                        onToggleControl={(ctrlId) => {
                          setMapChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(ctrlId)) next.delete(ctrlId);
                            else next.add(ctrlId);
                            return next;
                          });
                        }}
                        currentPaName={processArea.name}
                      />
                      {treeStandards.length === 0 && !treeLoading && (
                        <p className="text-xs text-slate-400 py-2 text-center">
                          No controls found. Add controls via Admin panel first.
                        </p>
                      )}
                    </div>
                  )}
                </Card>

                {/* ── Unmapped ── */}
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
              </div>
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
                canEdit={isSpoOrAdmin}
                onToggleMandatory={handleToggleMandatory}
                onSaveSoc={handleSaveSoc}
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
                    <div className="text-xs text-slate-500" suppressHydrationWarning>{a.activityType?.name} · Assessor: {a.assessor?.name} · {new Date(a.startDate).toLocaleDateString()}</div>
                    <div className="text-xs text-slate-400">{a.samples?.length ?? 0} samples · {a.findings?.length ?? 0} findings</div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ─── TAB 4: Knowledgebase (Admin Only) ─── */}
      {activeTab === "knowledgebase" && isAdmin && (
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
                    {msg.role === "assistant" ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">AI</span>
                          <button
                            onClick={() => speakMessage((msg as any)._rawContent || msg.content, i)}
                            className={`text-xs px-1.5 py-0.5 rounded ${speakingIndex === i ? "bg-blue-200 text-blue-700" : "text-slate-400 hover:text-slate-600"}`}
                            title={speakingIndex === i ? "Stop" : "Read aloud"}
                          >
                            {speakingIndex === i ? "🔊" : "🔈"}
                          </button>
                        </div>
                        <div
                          className="text-sm [&_p]:mb-1 [&_ul]:my-1 [&_li]:ml-3 [&_strong]:font-semibold [&_code]:text-xs [&_pre]:my-2"
                          dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                        />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
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
                    {msg.proposedPips && msg.proposedPips.length > 0 && (
                      <div className="mt-2 border-t border-slate-300 pt-2">
                        <p className="text-xs font-medium mb-1">📈 Proposed PIP Items:</p>
                        {msg.proposedPips.map((p, pi) => (
                          <div key={pi} className="text-xs mt-1 p-2 bg-amber-50 rounded border border-amber-200">
                            <div className="font-medium">{p.title}</div>
                            <div className="text-slate-500 mt-0.5">{p.description}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-400">Priority: {p.priority}</span>
                              {isSpoOrAdmin && (
                                <button onClick={async () => {
                                  await fetch("/api/admin/pip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: p.title, description: p.description, processAreaId: processArea.id, priority: p.priority === "High" ? 10 : p.priority === "Medium" ? 5 : 1 }) });
                                  refreshPips();
                                }} className="text-xs text-blue-600 hover:underline">＋ Add to PIP</button>
                              )}
                            </div>
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
              <input type="file" id="chat-file-upload" className="hidden"
                accept=".pdf,.md,.csv,.txt,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp"
                onChange={e => setAttachedFile(e.target.files?.[0] || null)} />
              <label htmlFor="chat-file-upload" className={`flex items-center justify-center w-9 h-9 rounded border border-slate-300 cursor-pointer hover:bg-slate-50 ${attachedFile ? "bg-blue-50 border-blue-400" : ""}`} title="Attach a file">
                📎
              </label>
              {attachedFile && <span className="text-xs text-slate-500 self-center truncate max-w-[120px]">{attachedFile.name}</span>}
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about this process area…"
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                aria-label="Chat message"
              />
              <button type="button" onClick={toggleListening}
                className={`flex items-center justify-center w-9 h-9 rounded border text-sm ${listening ? "bg-red-100 border-red-400 text-red-600 animate-pulse" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}
                title={listening ? "Stop listening" : "Speak your question"}>
                🎤
              </button>
              <Button variant="primary" size="sm" type="submit" disabled={!chatInput.trim() && !attachedFile || uploadingFile}>
                {uploadingFile ? "Uploading…" : "Send"}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* ─── TAB 5: Improvement (PIP Kanban) ─── */}
      {activeTab === "improvement" && (
        <ImprovementKanban pipItems={pipData} assessmentActions={assessmentActions} processAreaId={processArea.id} isSpoOrAdmin={isSpoOrAdmin} />
      )}

      {/* ─── TAB 6: Documents ─── */}
      {activeTab === "documents" && (
        <DocumentsPanel
          documents={documents}
          processAreaId={processArea.id}
          companyId={companyId}
          masterCompanyId={masterCompanyId}
          currentUserRole={currentUserRole}
        />
      )}
    </div>
  );
}
