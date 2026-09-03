"use client";

import { useCallback, useState } from "react";

const MAX = 2000;

type Result = {
  finding: {
    id: string;
    managementResponse: string | null;
    managementResponseAt: string | null;
    managementResponseById: string | null;
    managementResponseBy: { id: string; name: string; username: string } | null;
  };
};

/**
 * Management response composer (SAMS-005). Assumes the caller is an Assessor+
 * role of the owning company (the server route enforces it; this component only
 * surfaces the result/errors). Uncontrolled-input pattern per Principle #8 —
 * save on button; >2000 chars → 422 shown inline.
 */
export function ManagementResponseEditor({ findingId, initialResponse, initialBy }: {
  findingId: string;
  initialResponse: string | null;
  initialBy: { name: string; username: string } | null;
}) {
  const [value, setValue] = useState(initialResponse ?? "");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAtBy, setSavedAtBy] = useState<{ at: string; name: string } | null>(
    initialBy ? { at: initialResponse ? "saved" : "", name: initialBy.name } : null
  );

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/portal/findings/${findingId}/management-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managementResponse: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const r = data.finding as Result["finding"];
        setStatus({ ok: true, msg: "Response saved" });
        setSavedAtBy({
          at: r.managementResponseAt ? new Date(r.managementResponseAt).toLocaleString() : "",
          name: r.managementResponseBy?.name ?? "",
        });
      } else {
        setStatus({ ok: false, msg: data.error ?? `Save failed (${res.status})` });
      }
    } catch (e) {
      setStatus({ ok: false, msg: "Network error saving response" });
    } finally {
      setSaving(false);
    }
  }, [findingId, value]);

  const lengthOver = value.length > MAX;

  return (
    <div className="mt-3 rounded-lg border border-slate-100 p-3">
      <textarea
        aria-label="Management response"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX * 2}
        placeholder="Add a management response…"
        className={`w-full rounded-md border px-3 py-2 text-sm ${lengthOver ? "border-red-400" : "border-slate-300"}`}
        rows={3}
      />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={`${lengthOver ? "font-semibold text-red-600" : "text-slate-400"}`}>
          {value.length}/{MAX} chars
        </span>
        <div className="flex items-center gap-3">
          {status ? (
            <span className={status.ok ? "text-green-700" : "text-red-700"}>{status.msg}</span>
          ) : null}
          {savedAtBy?.at ? (
            <span className="text-slate-400">by {savedAtBy.name} · {savedAtBy.at}</span>
          ) : null}
          <button
            onClick={save}
            disabled={saving || lengthOver}
            className="rounded-md bg-blue-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save response"}
          </button>
        </div>
      </div>
    </div>
  );
}
