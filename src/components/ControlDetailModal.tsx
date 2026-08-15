"use client";

import { Modal } from "@/components/Modal";

export type ControlDetail = {
  id: string;
  name: string;
  statement?: string | null;
  controlType?: string | null;
  controlTypeDetail?: string | null;
  isHsseCritical?: boolean | null;
  ramRating?: string | null;
  riskWeight?: number | null;
  rawHealthScore?: number | null;
  lastTestedDate?: Date | string | null;
  lastTestResult?: string | null;
  csfWho?: string | null;
  csfWhat?: string | null;
  csfWhen?: string | null;
  csfWhere?: string | null;
  csfWhy?: string | null;
  csfHow?: string | null;
  csfEvidence?: string | null;
  keyActivities?: string | null;
  riskAddressed?: string | null;
  testingApproach?: string | null;
  effectivenessCriteria?: string | null;
  assuranceCadence?: string | null;
  controlOwner?: string | null;
  controlRef?: string | null;
  sourceFile?: string | null;
  practiceDocument?: string | null;
  standard?: string | null;
  uncertainFlags?: string | null;
  knowledge?: string | null;
};

const RISK_WEIGHT_LABELS: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };

function Field({ label, value }: { label: string; value?: string | number | boolean | Date | null }) {
  if (value === null || value === undefined || value === "") return null;
  let display: string;
  if (value instanceof Date) display = value.toLocaleDateString();
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) display = new Date(value).toLocaleDateString();
  else display = String(value);
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800 whitespace-pre-wrap">{display}</dd>
    </div>
  );
}

export function ControlDetailModal({
  control,
  requirementId,
  onClose,
}: {
  control: ControlDetail;
  requirementId?: string | null;
  onClose: () => void;
}) {
  const riskLabel = control.riskWeight != null ? `${control.riskWeight} — ${RISK_WEIGHT_LABELS[control.riskWeight] ?? ""}` : null;

  return (
    <Modal isOpen onClose={onClose} title={control.name} size="lg">
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
        {/* Statement */}
        {control.statement && (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{control.statement}</p>
          </div>
        )}

        {/* Control attributes */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Type" value={control.controlType} />
          {control.controlTypeDetail && <Field label="Type Detail" value={control.controlTypeDetail} />}
          <Field label="HSSE Critical" value={control.isHsseCritical == null ? null : control.isHsseCritical ? "Yes" : "No"} />
          <Field label="Risk Weight" value={riskLabel} />
          {control.ramRating && <Field label="RAM Rating" value={control.ramRating} />}
          {control.rawHealthScore != null && <Field label="Health Score" value={`${control.rawHealthScore}%`} />}
          {control.lastTestedDate && <Field label="Last Tested" value={control.lastTestedDate} />}
          {control.lastTestResult && <Field label="Last Test Result" value={control.lastTestResult} />}
          {requirementId && <Field label="Mapped Requirement" value={requirementId} />}
        </dl>

        {/* CSF core fields */}
        {(control.csfWho || control.csfWhat || control.csfWhen || control.csfWhere || control.csfWhy || control.csfHow || control.csfEvidence) && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Control Statement (CSF)</h4>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Who" value={control.csfWho} />
              <Field label="When" value={control.csfWhen} />
              <Field label="Where" value={control.csfWhere} />
              <Field label="What" value={control.csfWhat} />
              <Field label="Why" value={control.csfWhy} />
              <Field label="Evidence" value={control.csfEvidence} />
              <div className="sm:col-span-2">
                <Field label="How" value={control.csfHow} />
              </div>
            </dl>
          </div>
        )}

        {/* Enrichment */}
        {(control.keyActivities || control.riskAddressed || control.testingApproach || control.effectivenessCriteria || control.assuranceCadence || control.controlOwner) && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Enrichment & Assurance</h4>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Key Activities" value={control.keyActivities} />
              <Field label="Risk Addressed" value={control.riskAddressed} />
              <Field label="Testing Approach" value={control.testingApproach} />
              <Field label="Effectiveness Criteria" value={control.effectivenessCriteria} />
              <Field label="Assurance Cadence" value={control.assuranceCadence} />
              <Field label="Control Owner" value={control.controlOwner} />
            </dl>
          </div>
        )}

        {/* Traceability */}
        {(control.controlRef || control.sourceFile || control.practiceDocument || control.standard || control.uncertainFlags || control.knowledge) && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Traceability</h4>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Control Ref" value={control.controlRef} />
              <Field label="Source File" value={control.sourceFile} />
              <Field label="Practice Document" value={control.practiceDocument} />
              <Field label="Standard" value={control.standard} />
              <Field label="Uncertain Flags" value={control.uncertainFlags} />
              <Field label="Knowledge" value={control.knowledge} />
            </dl>
          </div>
        )}
      </div>
    </Modal>
  );
}
