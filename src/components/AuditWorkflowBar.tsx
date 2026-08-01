"use client";

interface Props {
  hasChecklist: boolean;
  hasAssignments: boolean;
  hasCompliance: boolean;
  hasFindings: boolean;
}

const steps = [
  { key: "checklist", label: "Adopt Checklist", icon: "📋" },
  { key: "controls", label: "Assign Controls", icon: "⚙️" },
  { key: "execute", label: "Execute Checklist", icon: "✅" },
  { key: "findings", label: "Record Findings", icon: "🔍" },
];

export function AuditWorkflowBar({ hasChecklist, hasAssignments, hasCompliance, hasFindings }: Props) {
  const status = {
    checklist: hasChecklist,
    controls: hasAssignments,
    execute: hasCompliance,
    findings: hasFindings,
  };

  return (
    <div className="mt-4 mb-2 px-1">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const done = status[step.key as keyof typeof status];
          return (
            <div key={step.key} className="flex items-center gap-1 flex-1">
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors flex-1 justify-center ${
                  done
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-50 text-slate-400 border border-slate-200"
                }`}
                title={done ? `${step.label}: Complete` : `${step.label}: Pending`}
              >
                <span>{step.icon}</span>
                <span className="hidden sm:inline">{step.label}</span>
                <span>{done ? "✓" : "○"}</span>
              </div>
              {i < steps.length - 1 && (
                <span className={`text-xs shrink-0 ${done ? "text-emerald-400" : "text-slate-300"}`}>→</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
