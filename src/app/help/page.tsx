"use client";
import { Suspense, useState, useEffect } from "react";
import { Card } from "@/components/Card";

function HelpContent() {
  const [topic, setTopic] = useState<string | null>(null);
  useEffect(() => { setTopic(new URLSearchParams(window.location.search).get("topic")); }, []);

  if (topic === "pip") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">📈 Process Improvement Plan — How to Use</h1>
        <div className="space-y-6">
          <Card title="What is the PIP Kanban?" padding="sm">
            <p className="text-sm text-slate-600">The Process Improvement Plan (PIP) helps Site Process Owners track improvement actions for their process area. It uses a <strong>Kanban board</strong> — a visual workflow where items move left to right as they progress.</p>
          </Card>
          <Card title="5 Workflow Columns" padding="sm">
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-2">
              <li><strong>💡 Proposed</strong> — An improvement has been identified but not yet reviewed. Start here.</li>
              <li><strong>✅ Approved</strong> — The SPO has accepted this as a valid improvement.</li>
              <li><strong>🔄 In Progress</strong> — Work is actively underway.</li>
              <li><strong>✔️ Implemented</strong> — Change made. Awaiting effectiveness verification.</li>
              <li><strong>📁 Closed</strong> — Verified effective, or rejected. Done.</li>
            </ul>
          </Card>
          <Card title="Adding an Item" padding="sm">
            <p className="text-sm text-slate-600">Click <strong>＋ Add Item</strong> in the top-right. Fill in title (required), description, and priority. The item starts in Proposed. Use the dropdown on each card to move it through columns.</p>
          </Card>
          <Card title="MIC Statement" padding="sm">
            <p className="text-sm text-slate-600">The <strong>Management in Control Statement</strong> on the Overview tab is where the SPO writes their overall assessment. It should reference PIP outcomes.</p>
          </Card>
          <a href="/help" className="text-sm text-blue-600 hover:underline">← Back to general help</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Help & User Guide</h1>
      <div className="space-y-6">
        <Card title="Dashboard" padding="sm">
          <p className="text-sm text-slate-600">The dashboard shows Process Health grouped by standard. Click any process area to view its details.</p>
        </Card>
        <Card title="🎬 Demo — Leadership Walkthrough" padding="sm">
          <p className="text-sm text-slate-600">A presentation-style walkthrough of SAMS: the business problem we solve, how frontline assurance flows into Management in Control, and what the journey looks like.</p>
          <a href="/demo" className="text-sm text-blue-600 hover:underline mt-2 inline-block">🎬 View Demo →</a>
        </Card>
        <Card title="Process Improvement Plan (PIP)" padding="sm">
          <p className="text-sm text-slate-600">The <strong>Improvement</strong> tab in Process Details provides a Kanban board for tracking improvement actions per process area.</p>
          <a href="/help?topic=pip" className="text-sm text-blue-600 hover:underline mt-2 inline-block">📈 PIP Help →</a>
        </Card>
        <Card title="Assessments" padding="sm">
          <p className="text-sm text-slate-600">Create assessments from the dashboard. Each has tabs for Control Assignment, Sample Selection, Findings & Actions, and Activities.</p>
        </Card>
        <Card title="Requirements & Controls" padding="sm">
          <p className="text-sm text-slate-600">In Process Details, the Requirements & Controls tab shows controls grouped by requirement. Use Map Controls to reassign them.</p>
        </Card>
        <Card title="Gamification" padding="sm">
          <p className="text-sm text-slate-600">Earn points by completing assessments and closing actions. Badges across 8 emotional drives.</p>
        </Card>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading...</div>}>
      <HelpContent />
    </Suspense>
  );
}
