import { Card } from "@/components/Card";

export const metadata = { title: "SAMS Demo — SMDS Leadership Presentation", description: "A walkthrough of SAMS: from business pain to Management in Control" };

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* ── Hero ── */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">SAMS — Shell Assurance Management System</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          From frontline assurance to Management in Control — a single system for barrier health visibility.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PART 1 — THE BUSINESS PAIN
          ═══════════════════════════════════════════════════════════════════════ */}
      <Section title="Part 1 — Why do we need SAMS?" icon="🩺" />

      <PainCard
        number="1"
        title="No single repository for assurance results"
        body="Today, frontline assurance — go-sees, health checks, LOA 1/2/3 assessments — are spread across multiple tools. Some are in Permit Vision, some in Microsoft Forms, some in spreadsheets saved on shared drives. When leadership asks 'How healthy are our barriers?', there is no single place to look."
      />

      <PainCard
        number="2"
        title="Inconsistent methods, no standard workflow"
        body="Different teams conduct assurance differently. There is no standard way to capture samples, rate control effectiveness, or track findings to closure. This makes it impossible to compare health across processes or draw organisation-wide conclusions."
      />

      <PainCard
        number="3"
        title="Broken traceability — we cannot connect the dots"
        body="Observations from the field cannot be linked to specific controls. Controls cannot be linked to requirements. Requirements cannot be linked to process health. And without that traceability, we cannot credibly demonstrate 'Management in Control' at the process level, let alone at the organisation level."
      />

      <div className="my-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-amber-900 text-sm leading-relaxed">
          <strong>🎯 The core problem:</strong> We have assurance activities happening. We have findings being raised. We have actions being closed. But we have no way to answer the most important question:<br />
          <em className="text-base">"Are our barriers holding — right now, across every process?"</em>
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PART 2 — THE SOLUTION
          ═══════════════════════════════════════════════════════════════════════ */}
      <Section title="Part 2 — How SAMS solves this" icon="🔧" />

      <StepCard
        step="2.1"
        title="A single source of truth for all process areas"
        body="SAMS organises every management system standard and process area in one place. Each process area has its own Overview page — a live dashboard of health, risk, and assurance status. This is the single pane of glass leadership has been asking for."
        image="/screenshots/02-process-overview-control-of-work.png"
        imageAlt="Control of Work Process Overview — ORCA dashboard showing objectives, risk, controls health, assurance, improvement, and MIC statement"
        imageCaption="Control of Work / Permit to Work — Process Overview with live health metrics"
      />

      <StepCard
        step="2.2"
        title="Standardised frontline assurance workflow"
        body="Every assessment follows the same structured workflow. The assessor creates the assessment, assigns controls to be tested (grouped by process area and requirement), collects samples from the field, and records findings. This is how we move from ad-hoc assurance to systematic barrier verification."
        image="/screenshots/03-assessment-overview.png"
        imageAlt="PTW/SI FLA Audit assessment overview with 13 controls, 3 samples, 1 finding, 1 action"
        imageCaption="PTW FLA Audit — Assessment Overview showing 13 controls assigned, 3 samples collected, 1 finding raised"
      />

      <StepCard
        step="2.3"
        title="Controls mapped to requirements — full traceability"
        body="Each control is mapped to its parent requirement via the Permit to Work standard. The assessor can see exactly which controls belong to which requirement, and rate each control's effectiveness based on the evidence collected. The 2-level hierarchy (Requirement → Control) makes it clear what's been tested and what hasn't."
        image="/screenshots/04b-assessment-controls-expanded.png"
        imageAlt="Control Assignment tab showing Permit to Work controls expanded by requirement, with effectiveness ratings"
        imageCaption="Control Assignment — 13 PTW controls grouped by requirement, with inline effectiveness ratings"
      />

      <StepCard
        step="2.4"
        title="Samples collected, verified on desktop and in the field"
        body="The assessor adds samples — Permit-to-Work certificates, isolation certificates, gas test records — and marks each as Tested after desktop review or field verification. Each sample can have a conclusion (Effective / Not Effective), and findings can be raised directly from a sample."
        image="/screenshots/05-assessment-samples.png"
        imageAlt="Sample Selection tab with 3 PTW/SI samples, status radios, conclusion dropdowns"
        imageCaption="Sample Selection — 3 PTW/SI samples with status tracking and conclusion ratings"
      />

      <StepCard
        step="2.5"
        title="Findings captured, actions tracked to closure"
        body="When a gap is identified, the assessor raises a Finding and creates an Action. The action is assigned to an action party, given a target date, and tracked until closure. Closure requires evidence and approval. Every finding and action is linked back to the control it affects — so we always know which barrier has a gap."
        image="/screenshots/06-assessment-findings.png"
        imageAlt="Finding & Actions tab with FID-000003, severity Low, linked action with due date"
        imageCaption="Finding & Actions — FID-000003 linked to an action with due date, closure tracking"
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          PART 3 — DEMONSTRATING MANAGEMENT IN CONTROL
          ═══════════════════════════════════════════════════════════════════════ */}
      <Section title="Part 3 — Demonstrating Management in Control" icon="🛡️" />

      <div className="space-y-5">
        <p className="text-slate-700 leading-relaxed">
          This is where the system delivers its core value. Once assessments are completed, SAMS automatically recalculates the health of every control tested.
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">How Control Health is calculated</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4">Finding Severity</th>
                <th className="py-2 pr-4">Health Deduction</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <tr className="border-b border-slate-100"><td className="py-2">Low</td><td className="py-2">0%</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">Medium</td><td className="py-2">−5%</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">High</td><td className="py-2">−10%</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">Serious</td><td className="py-2">−15%</td></tr>
              <tr><td className="py-2">Repeat (any severity)</td><td className="py-2">−15%</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-2">Deductions are per outstanding action linked to the control. Cumulative floor at 0%.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
          <InfoCard title="Per Control" body="Health = 100% − Σ(outstanding action deductions). Recalculated every time an assessment is completed." />
          <InfoCard title="Per Process" body="Process Health = average of all control health scores within that process area." />
          <InfoCard title="Per Organisation" body="Aggregate of all process health scores — giving leadership a single number for barrier health across the asset." />
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h3 className="font-semibold text-slate-900 mb-2">📝 Management in Control (MIC) Statement</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            At the end of each quarter, the Site Process Owner (SPO) or Site Process Focal Point (SPFP) reviews the process health data — controls tested, findings raised, actions closed — and writes a MIC Statement. This is their professional assessment: <em>"Based on the assurance activities conducted this quarter, I confirm that the barriers for Permit to Work are holding / need attention."</em>
          </p>
          <p className="text-sm text-slate-600 mt-2">
            The MIC Statement is discussed at the next Business Assurance Committee (BAC) meeting. It transforms assurance from a paperwork exercise into a leadership conversation about real barrier health.
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PART 4 — THE JOURNEY
          ═══════════════════════════════════════════════════════════════════════ */}
      <Section title="Part 4 — The Journey from Here to There" icon="🗺️" />

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-slate-700">
              <th className="py-2 pr-4 w-16">Stage</th>
              <th className="py-2 pr-4">What we do today</th>
              <th className="py-2 pr-4 text-blue-700">→ What SAMS enables</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-100">
              <td className="py-3 font-medium text-slate-800">1</td>
              <td className="py-3">Frontline assurance done in Permit Vision, Forms, spreadsheets — no single view</td>
              <td className="py-3 text-blue-700">All assurance captured in one system. Structured workflow: create → assign controls → sample → find → close.</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-3 font-medium text-slate-800">2</td>
              <td className="py-3">Findings and actions tracked in separate tools, not linked to controls</td>
              <td className="py-3 text-blue-700">Every finding traces to a control. Every action traces to a finding. Full audit trail.</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-3 font-medium text-slate-800">3</td>
              <td className="py-3">Control health is a manual calculation — if done at all</td>
              <td className="py-3 text-blue-700">Control health recalculated automatically on every assessment completion. Always current.</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-3 font-medium text-slate-800">4</td>
              <td className="py-3">MIC conversations rely on anecdotal evidence</td>
              <td className="py-3 text-blue-700">SPO/SPFP writes MIC Statement backed by live process health data. BAC discussions are data-driven.</td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-slate-800">5</td>
              <td className="py-3">No way to see barrier health across the asset at a glance</td>
              <td className="py-3 text-blue-700">Dashboard shows process health per standard, per process area. One click to drill into any gap.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CLOSING
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mt-12 p-6 rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-white text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-3">SAMS delivers what leadership has been asking for</h2>
        <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
          A single system that connects frontline assurance → control health → process health → Management in Control.
          Built for the Microsoft Power Platform — SharePoint, PowerApps, Power Automate — leveraging our existing Microsoft 365 investment.
        </p>
        <p className="text-sm text-slate-400 mt-4">
          Proposal for SMDS Leadership · July 2026 · Prepared by the SAMS Project Team
        </p>
      </div>
    </div>
  );
}

/* ── Reusable Sub-Components ──────────────────────────────────────────────── */

function Section({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="mt-12 mb-6 flex items-center gap-3 border-b border-slate-200 pb-3">
      <span className="text-2xl">{icon}</span>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
    </div>
  );
}

function PainCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50/60 p-5">
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-sm font-bold">{number}</span>
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, title, body, image, imageAlt, imageCaption }: { step: string; title: string; body: string; image?: string; imageAlt?: string; imageCaption?: string }) {
  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{step}</span>
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
      </div>
      {image && (
        <div className="border-t border-slate-100 bg-slate-50 px-2 py-3">
          <img src={image} alt={imageAlt || title} className="w-full rounded border border-slate-200 shadow-sm" loading="lazy" />
          {imageCaption && <p className="mt-2 text-center text-xs text-slate-400 italic">{imageCaption}</p>}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="font-semibold text-sm text-slate-900 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
    </div>
  );
}
