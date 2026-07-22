"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/Badge";
import Link from "next/link";

type Interview = {
  assignmentId: string;
  userRoles: string;
  remarks: string | null;
  activity: {
    id: string;
    aaID: string;
    activityName: string;
    activityDate: string;
    activityStartTime: string;
    activityEndTime: string;
    activityDuration: string | null;
    activityDescription: string | null;
    typeId: string;
    checklists: string | null;
    activityNotes: string | null;
    controls: Array<{ id: string; controlId: string; name: string }>;
  };
  assessment: {
    id: string;
    name: string;
    status: string;
    assessorName: string;
  };
};

const TYPE_LABELS: Record<string, string> = {
  "ACT-001": "Interview",
  "ACT-002": "Document Review",
  "ACT-003": "Site Visit",
};

export function MyInterviewsClient() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/my/interviews")
      .then((r) => r.json())
      .then((d) => setInterviews(d.interviews || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-slate-400 animate-pulse">Loading your interviews…</p>
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Card>
          <div className="py-12 text-center">
            <p className="text-2xl mb-2">📅</p>
            <p className="text-sm font-medium text-slate-700">No Interviews Assigned</p>
            <p className="text-xs text-slate-400 mt-1">
              You haven't been assigned to any assessment interviews yet.
            </p>
            <Link
              href="/fla"
              className="mt-4 inline-block rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Interviews</h1>
          <p className="text-sm text-slate-500 mt-1">{interviews.length} interview{interviews.length !== 1 ? "s" : ""} assigned to you</p>
        </div>
        <Link
          href="/fla"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="space-y-3">
        {interviews.map((inv) => {
          const isExpanded = expanded.has(inv.activity.id);
          return (
            <Card key={inv.assignmentId} padding="sm">
              <div
                className="cursor-pointer"
                onClick={() => toggle(inv.activity.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {inv.activity.activityName}
                      </span>
                      <Badge variant="default" size="sm">
                        {TYPE_LABELS[inv.activity.typeId] || inv.activity.typeId}
                      </Badge>
                      {inv.activity.checklists?.includes("Mandatory") && (
                        <Badge variant="warning" size="sm">Mandatory</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{new Date(inv.activity.activityDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                      <span>{inv.activity.activityStartTime} – {inv.activity.activityEndTime}</span>
                      {inv.activity.activityDuration && <span>{inv.activity.activityDuration}</span>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Assessment:{" "}
                      <Link
                        href={`/fla/${inv.assessment.id}`}
                        className="text-blue-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {inv.assessment.name}
                      </Link>
                      {" · "}
                      <StatusBadge status={inv.assessment.status} />
                      {" · "}Assessor: {inv.assessment.assessorName}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 ml-2 shrink-0">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {/* Your role + remarks */}
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Your role:</span>
                  <span className="font-medium text-slate-700">{inv.userRoles || "Participant"}</span>
                  {inv.remarks && (
                    <span className="text-slate-400 italic">— {inv.remarks}</span>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-4 border-t border-slate-200 pt-4 space-y-4">
                  {/* Description */}
                  {inv.activity.activityDescription && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 mb-1">Description</h4>
                      <p className="text-sm text-slate-700">{inv.activity.activityDescription}</p>
                    </div>
                  )}

                  {/* Controls */}
                  {inv.activity.controls.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 mb-1">
                        Controls Covered ({inv.activity.controls.length})
                      </h4>
                      <ul className="space-y-1">
                        {inv.activity.controls.map((c) => (
                          <li key={c.id} className="text-sm text-slate-700 flex items-center gap-1">
                            <span className="text-slate-400">•</span> {c.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Checklists / Notes */}
                  {inv.activity.checklists && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 mb-1">Checklists</h4>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{inv.activity.checklists}</p>
                    </div>
                  )}
                  {inv.activity.activityNotes && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 mb-1">Activity Notes</h4>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{inv.activity.activityNotes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Link
                      href={`/fla/${inv.assessment.id}`}
                      className="rounded-md bg-blue-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-900"
                    >
                      View Full Assessment
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
