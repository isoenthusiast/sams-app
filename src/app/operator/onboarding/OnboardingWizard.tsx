"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Types (mirror the API responses) ──────────────────────────────────────
type CompanyValidationError = { field: string; code: string; message: string };
type BootstrapPreview = { standards: number; processAreas: number; requirements: number; controls: number; mapControl2Requirement: number };
type UserRow = { name: string; username: string; email?: string; role?: string; managerName?: string };
type UserReport = {
  total: number; valid: number;
  duplicates: Array<{ kind: string; username: string; name: string }>;
  invalidRoles: Array<{ username: string; role: string }>;
  missingFields: Array<{ index: number; username: string; fields: string[] }>;
  unresolvedManagers: Array<{ username: string; managerName: string }>;
  managerResolution: { requested: number; resolved: number; rate: number | null };
};
type TempPassword = { username: string; tempPassword: string };

const STEPS = [
  { n: 1, label: "Company" },
  { n: 2, label: "Content" },
  { n: 3, label: "Users" },
  { n: 4, label: "Review" },
];

function parseCsv(text: string): { rows: UserRow[]; lineErrors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: UserRow[] = [];
  const lineErrors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (i === 0 && cols.some((c) => /username/i.test(c))) continue; // header row
    const [name, username, email, role, managerName] = cols;
    if (!name || !username) {
      lineErrors.push(`Row ${i + 1}: missing name or username ("${lines[i]}")`);
      continue;
    }
    rows.push({ name, username, email, role, managerName });
  }
  return { rows, lineErrors };
}

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — company
  const [companyID, setCompanyID] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyValid, setCompanyValid] = useState<{ ok: boolean; errors: CompanyValidationError[] } | null>(null);
  const [company, setCompany] = useState<{ id: string; companyID: string; companyName: string } | null>(null);

  // Step 2 — content
  const [contentPreview, setContentPreview] = useState<BootstrapPreview | null>(null);
  const [contentResult, setContentResult] = useState<BootstrapPreview | null>(null);
  const [committed, setCommitted] = useState<Record<string, boolean>>({});

  // Step 3 — users
  const [csv, setCsv] = useState("");
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [userReport, setUserReport] = useState<UserReport | null>(null);
  const [users, setUsers] = useState<{ created: number; wizardId: string } | null>(null);

  // Step 4 — review
  const [final, setFinal] = useState<{ report: any; tempPasswords: TempPassword[] } | null>(null);
  const [revealed, setRevealed] = useState(false);

  const report = useMemo(() => {
    // Aggregate the wizard's state for the review step.
    return {
      company: company,
      content: contentResult ?? contentPreview,
      usersReport: userReport,
      usersCreated: users?.created ?? 0,
    };
  }, [company, contentResult, contentPreview, userReport, users]);

  const fetchContentPreview = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/content", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContentPreview(data.preview);
    } catch (e: any) {
      setError(e.message ?? "Could not load content preview");
    }
  }, []);

  useEffect(() => {
    fetchContentPreview();
  }, [fetchContentPreview]);

  const runCompanyDryRun = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyID, companyName, dryRun: true }),
      });
      const data = await res.json();
      setCompanyValid({ ok: data.ok, errors: data.errors ?? [] });
      setCompany(null);
    } catch (e: any) {
      setError(e.message ?? "Dry-run failed");
    } finally {
      setBusy(false);
    }
  };

  const commitCompany = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyID, companyName, dryRun: false }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setCompanyValid({ ok: false, errors: [{ field: "companyID", code: "DUPLICATE", message: data.error ?? "Company ID already exists" }] });
        setCompany(null);
        setError("Commit blocked: company ID already exists");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCompany({ id: data.company.id, companyID: data.company.companyID, companyName: data.company.companyName });
      setCommitted((c) => ({ ...c, company: true }));
      setStep(2);
    } catch (e: any) {
      setError(e.message ?? "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const runContentDryRun = async () => {
    if (!company) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, dryRun: true }),
      });
      const data = await res.json();
      setContentPreview(data.preview);
    } catch (e: any) {
      setError(e.message ?? "Content dry-run failed");
    } finally {
      setBusy(false);
    }
  };

  const commitContent = async () => {
    if (!company) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setContentResult(data.results);
      setCommitted((c) => ({ ...c, content: true }));
      setStep(3);
    } catch (e: any) {
      setError(e.message ?? "Content commit failed");
    } finally {
      setBusy(false);
    }
  };

  const parseRows = () => {
    const { rows, lineErrors } = parseCsv(csv);
    setRows(rows);
    setLineErrors(lineErrors);
    setUserReport(null);
  };

  const runUsersDryRun = async () => {
    if (!company || rows.length === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, rows, dryRun: true }),
      });
      const data = await res.json();
      setUserReport(data.report);
    } catch (e: any) {
      setError(e.message ?? "Users dry-run failed");
    } finally {
      setBusy(false);
    }
  };

  const commitUsers = async () => {
    if (!company || rows.length === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, rows, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUsers({ created: data.created, wizardId: data.wizardId });
      setCommitted((c) => ({ ...c, users: true }));
      setStep(4);
    } catch (e: any) {
      setError(e.message ?? "Users commit failed");
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!company || !users) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/operator/onboarding/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, wizardId: users.wizardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFinal({ report: data.report, tempPasswords: data.tempPasswords });
      setRevealed(true);
    } catch (e: any) {
      setError(e.message ?? "Finalize failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Stepper step={step} />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">Error:</span> {error}
          <button className="ml-3 text-red-500 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {step === 1 && <CompanyStep {...{ companyID, setCompanyID, companyName, setCompanyName, companyValid, runCompanyDryRun, commitCompany, busy, company }} />}

      {step === 2 && (
        <ContentStep
          {...{ company, contentPreview, contentResult, runContentDryRun, commitContent, busy, fetchContentPreview }}
        />
      )}

      {step === 3 && (
        <UsersStep
          {...{ company, csv, setCsv, lineErrors, rows, parseRows, runUsersDryRun, commitUsers, userReport, busy }}
        />
      )}

      {step === 4 && (
        <ReviewStep
          {...{ company, contentResult, contentPreview, userReport, users, final, revealed, finalize, busy, report }}
        />
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          disabled={step === 1 || busy}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          ← Back
        </button>
        <span className="text-xs text-slate-400">Step {step} of 4</span>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-0 overflow-x-auto">
      {STEPS.map((s, i) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <li key={s.n} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  active ? "bg-blue-800 text-white" : done ? "bg-green-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {done ? "✓" : s.n}
              </span>
              <span className={`text-sm font-medium ${active ? "text-slate-900" : "text-slate-500"}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="mx-3 h-px w-8 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1: Company ────────────────────────────────────────────────────────
function CompanyStep(props: {
  companyID: string; setCompanyID: (v: string) => void;
  companyName: string; setCompanyName: (v: string) => void;
  companyValid: { ok: boolean; errors: CompanyValidationError[] } | null;
  runCompanyDryRun: () => void; commitCompany: () => void; busy: boolean;
  company: { id: string; companyID: string; companyName: string } | null;
}) {
  const { companyID, setCompanyID, companyName, setCompanyName, companyValid, runCompanyDryRun, commitCompany, busy, company } = props;
  const companyErr = companyValid?.errors.find((e) => e.field === "companyID");
  return (
    <Section title="1 · Company basics" desc="The new client tenant. The row is only created on commit — never on a dry-run.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company ID (unique)" error={companyErr?.message}>
          <input
            className={inputCls}
            value={companyID}
            onChange={(e) => setCompanyID(e.target.value)}
            placeholder="e.g. PILOT01"
            disabled={busy || !!company}
          />
        </Field>
        <Field label="Company name">
          <input
            className={inputCls}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Pilot Client Ltd"
            disabled={busy || !!company}
          />
        </Field>
      </div>

      {companyValid && (
        <ResultBox ok={companyValid.ok}>
          {companyValid.ok
            ? "Company ID is available — safe to commit."
            : "Commit blocked. Fix the errors below, then re-run the dry-run."}
          {companyValid.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {companyValid.errors.map((err, i) => (
                <li key={i}>
                  <code className="text-xs">{err.field}</code> — {err.message}
                </li>
              ))}
            </ul>
          )}
        </ResultBox>
      )}

      {company ? (
        <p className="mt-4 text-sm text-green-700 font-medium">
          ✓ Company created: {company.companyID} — {company.companyName}
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <button onClick={runCompanyDryRun} disabled={busy || !!company} className={btnSecondary}>
          {busy ? "Working…" : "Dry-run"}
        </button>
        <button onClick={commitCompany} disabled={busy || !!company || !companyValid?.ok} className={btnPrimary}>
          {busy ? "Working…" : "Commit company"}
        </button>
      </div>
    </Section>
  );
}

// ── Step 2: Content ────────────────────────────────────────────────────────
function ContentStep(props: {
  company: { id: string } | null;
  contentPreview: BootstrapPreview | null;
  contentResult: BootstrapPreview | null;
  runContentDryRun: () => void; commitContent: () => void;
  busy: boolean; fetchContentPreview: () => void;
}) {
  const { company, contentPreview, contentResult, runContentDryRun, commitContent, busy, fetchContentPreview } = props;
  const counts = contentResult ?? contentPreview;
  return (
    <Section title="2 · Content adoption" desc="Adopt the SMDS master assurance content into the new tenant by running the existing bootstrap.">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-900">SMDS Master Assurance Content</div>
            <div className="text-xs text-slate-500">Standards → Process Areas → Requirements → Controls → mappings, from SAMS001.</div>
          </div>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">selected</span>
        </div>
        {counts ? (
          <CountGrid counts={counts} />
        ) : (
          <p className="text-sm text-slate-400">Run a dry-run to see what the bootstrap will produce.</p>
        )}
        {contentResult && <p className="mt-3 text-sm font-medium text-green-700">✓ Bootstrap committed — counts shown above are the final result.</p>}
      </div>
      <div className="mt-5 flex gap-3">
        <button onClick={runContentDryRun} disabled={busy || !company} className={btnSecondary}>
          {busy ? "Working…" : "Dry-run"}
        </button>
        <button onClick={commitContent} disabled={busy || !company} className={btnPrimary}>
          {busy ? "Working…" : "Commit & bootstrap"}
        </button>
        <button onClick={fetchContentPreview} disabled={busy} className={btnGhost}>
          Refresh
        </button>
      </div>
      {contentResult ? null : (
        <p className="mt-3 text-xs text-slate-500">
          Committing copies the full SMDS content set into the new tenant — this can take up to a minute on the remote DB.
        </p>
      )}
    </Section>
  );
}

// ── Step 3: Users ──────────────────────────────────────────────────────────
function UsersStep(props: {
  company: { id: string } | null;
  csv: string; setCsv: (v: string) => void; lineErrors: string[];
  rows: UserRow[]; parseRows: () => void;
  runUsersDryRun: () => void; commitUsers: () => void;
  userReport: UserReport | null; busy: boolean;
}) {
  const { company, csv, setCsv, lineErrors, rows, parseRows, runUsersDryRun, commitUsers, userReport, busy } = props;
  const blocked = userReport
    ? userReport.duplicates.length > 0 || userReport.invalidRoles.length > 0 || userReport.missingFields.length > 0
    : null;
  return (
    <Section title="3 · Provision users" desc="Paste CSV or add rows. Temp passwords are generated on commit and revealed once at the end.">
      <Field label="CSV paste (name, username, email, role, managerName)">
        <textarea
          className={`${inputCls} h-32 font-mono text-xs`}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"Alice A, alice.a, alice.a@example.com, Assessor, Bob B\nBob B, bob.b, bob.b@example.com, Admin,\nCarol C, carol.c, carol.c@example.com, Assessor,\nDavid D, david.d, david.d@example.com, Superuser,"}
          disabled={busy}
        />
      </Field>
      <button onClick={parseRows} disabled={busy} className={btnSecondary}>
        Parse rows
      </button>

      {lineErrors.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-semibold">CSV row errors — fix before committing:</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {lineErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {rows.length > 0 && (
        <div className="mt-3">
          <div className="text-sm text-slate-600">Parsed {rows.length} row(s):</div>
          <table className="mt-2 w-full text-left text-xs">
            <thead><tr className="text-slate-400">
              <th className="py-1 pr-2">name</th><th className="py-1 pr-2">username</th><th className="py-1 pr-2">role</th><th className="py-1">manager</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2">{r.name}</td>
                  <td className="py-1 pr-2 font-mono">{r.username}</td>
                  <td className="py-1 pr-2">{r.role || "Assessor"}</td>
                  <td className="py-1">{r.managerName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {userReport && <UserReportPanel report={userReport} />}

      <div className="mt-5 flex gap-3">
        <button onClick={runUsersDryRun} disabled={busy || rows.length === 0 || !company} className={btnSecondary}>
          {busy ? "Working…" : "Dry-run"}
        </button>
        <button
          onClick={commitUsers}
          disabled={busy || rows.length === 0 || !company || blocked === null || blocked}
          title={blocked ? "Commit blocked: fix duplicates / invalid roles / missing fields first." : "Provision users"}
          className={btnPrimary}
        >
          {busy ? "Working…" : "Commit & provision"}
        </button>
      </div>
      {blocked && <p className="mt-2 text-xs text-red-600">Commit is blocked while duplicates, invalid roles, or missing fields are present.</p>}
    </Section>
  );
}

function UserReportPanel({ report }: { report: UserReport }) {
  return (
    <ResultBox ok={report.duplicates.length === 0 && report.invalidRoles.length === 0 && report.missingFields.length === 0}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>Total <b>{report.total}</b></span>
        <span>Valid <b className="text-green-700">{report.valid}</b></span>
        <span>Duplicates <b className={report.duplicates.length ? "text-red-600" : ""}>{report.duplicates.length}</b></span>
        <span>Invalid roles <b className={report.invalidRoles.length ? "text-red-600" : ""}>{report.invalidRoles.length}</b></span>
        <span>Missing fields <b className={report.missingFields.length ? "text-red-600" : ""}>{report.missingFields.length}</b></span>
        <span>Manager resolution <b>{report.managerResolution.rate === null ? "n/a" : `${report.managerResolution.rate}%`}</b> ({report.managerResolution.resolved}/{report.managerResolution.requested})</span>
      </div>
      {report.duplicates.length > 0 && (
        <div className="mt-2">
          <div className="font-semibold text-red-700">Duplicate usernames:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.duplicates.map((d, i) => <li key={i}><code className="text-xs">{d.username}</code> ({d.kind})</li>)}
          </ul>
        </div>
      )}
      {report.invalidRoles.length > 0 && (
        <div className="mt-2">
          <div className="font-semibold text-red-700">Invalid roles:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.invalidRoles.map((d, i) => <li key={i}><code className="text-xs">{d.username}</code> → {d.role||"''"}</li>)}
          </ul>
        </div>
      )}
      {report.missingFields.length > 0 && (
        <div className="mt-2">
          <div className="font-semibold text-red-700">Missing required fields:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.missingFields.map((d, i) => (
              <li key={i}><code className="text-xs">{d.username || `row ${d.index + 1}`}</code> — {d.fields.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}
      {report.unresolvedManagers.length > 0 && (
        <div className="mt-2">
          <div className="font-semibold text-amber-700">Unresolved managers (will store as tbc text):</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.unresolvedManagers.map((d, i) => <li key={i}><code className="text-xs">{d.username}</code> → {d.managerName}</li>)}
          </ul>
        </div>
      )}
    </ResultBox>
  );
}

// ── Step 4: Review & go-live ───────────────────────────────────────────────
function ReviewStep(props: {
  company: { id: string; companyID: string; companyName: string } | null;
  contentResult: BootstrapPreview | null; contentPreview: BootstrapPreview | null;
  userReport: UserReport | null;
  users: { created: number; wizardId: string } | null;
  final: { report: any; tempPasswords: TempPassword[] } | null;
  revealed: boolean; finalize: () => void; busy: boolean; report: any;
}) {
  const { company, contentResult, contentPreview, userReport, users, final, revealed, finalize, busy } = props;
  const counts = contentResult ?? contentPreview;
  return (
    <Section title="4 · Review & go-live" desc="Full validation report, then reveal the one-time temp passwords. Copy them now — they are shown only once.">
      {final ? (
        <div className="space-y-4">
          <ResultBox ok={final.report.approvedForGoLive}>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Company <b>{final.report.companyID}</b></span>
              <span>Standards <b>{final.report.content.standards}</b></span>
              <span>Requirements <b>{final.report.content.requirements}</b></span>
              <span>Controls <b>{final.report.content.controls}</b></span>
              <span>Users <b>{final.report.users.count}</b></span>
            </div>
            {!final.report.approvedForGoLive && <p className="mt-2 text-sm text-red-700">Not yet approved: content or users missing.</p>}
          </ResultBox>

          {final.tempPasswords.length > 0 ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold text-blue-900">🔑 One-time temp passwords</div>
                <span className="text-xs text-blue-600">shown once — copy now</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead><tr className="text-blue-700">
                  <th className="py-1 pr-2">username</th><th className="py-1">temp password</th>
                </tr></thead>
                <tbody>
                  {final.tempPasswords.map((t, i) => (
                    <tr key={i} className="border-t border-blue-100">
                      <td className="py-1 pr-2 font-mono">{t.username}</td>
                      <td className="py-1 font-mono text-blue-900">{t.tempPassword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-blue-700">
                Hand these to the client white-glove. Users sign in with their username + this temp password.
              </p>
            </div>
          ) : (
            <p className="text-sm text-amber-600">(temp passwords already revealed — this screen is one-time only)</p>
          )}
        </div>
      ) : (
        <div>
          {company && (
            <div className="mb-3 text-sm text-slate-600">
              Onboarding <b>{company.companyID}</b> — {company.companyName}. {users ? `${users.created} users ready.` : "Users not yet committed."}
            </div>
          )}
          <button onClick={finalize} disabled={busy} className={btnPrimary}>
            {busy ? "Working…" : "Review & reveal"}
          </button>
        </div>
      )}
    </Section>
  );
}

// ── Shared UI bits ─────────────────────────────────────────────────────────
const inputCls = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800 disabled:bg-slate-50 disabled:text-slate-400";
const btnPrimary = "rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-40";
const btnSecondary = "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const btnGhost = "rounded-md px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40";

function Section(props: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">{props.desc}</p>
      {props.children}
    </div>
  );
}

function Field(props: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{props.label}</span>
      {props.children}
      {props.error && <span className="mt-1 block text-sm text-red-600">{props.error}</span>}
    </label>
  );
}

function ResultBox(props: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`mt-4 rounded-md border px-4 py-3 text-sm ${
        props.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {props.children}
    </div>
  );
}

function CountGrid({ counts }: { counts: BootstrapPreview }) {
  const items: Array<[string, number]> = [
    ["Standards", counts.standards],
    ["Process Areas", counts.processAreas],
    ["Requirements", counts.requirements],
    ["Controls", counts.controls],
    ["Control→Req mappings", counts.mapControl2Requirement],
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map(([label, n]) => (
        <div key={label} className="rounded-md border border-slate-200 bg-white p-2 text-center">
          <div className="text-xl font-bold text-slate-900">{n}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}
