"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";

/**
 * SAMS-011 public read-only API key management card (settled decision #5).
 *
 * Client Admin (the settings page is already Admin-gated) manages the ACTIVE
 * company's keys:
 *  - CREATE: POST /api/admin/api-keys { companyId, label } — returns the
 *    PLAINTEXT bearer ONCE; we render it in a "show once" box and never store it.
 *  - LIST:   GET /api/admin/api-keys?companyId= — labels/dates/creator only;
 *            NO key material is ever fetched or rendered.
 *  - REVOKE: DELETE /api/admin/api-keys/[id] — sets revokedAt (403 for public use).
 *
 * Scope is server-enforced (client Admin of the target company OR provider), and
 * the page only renders for role=Admin of the resolved portal company, so the
 * card can only ever manage a company the caller belongs to.
 */
type KeyRow = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: { id: string; name: string | null } | null;
};

export function PortalApiKeySettings({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadKeys = useCallback(async () => {
    const res = await fetch(`/api/admin/api-keys?companyId=${encodeURIComponent(companyId)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.keys)) setKeys(data.keys);
    else setMessage({ kind: "err", text: data.error ?? "Failed to load API keys" });
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function createKey() {
    const clean = label.trim();
    if (!clean) {
      setMessage({ kind: "err", text: "Enter a label for the key first." });
      return;
    }
    setCreating(true);
    setMessage(null);
    setCreatedKey(null);
    setCreatedLabel(null);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, label: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error ?? "Failed to create key" });
        setCreating(false);
        return;
      }
      setCreatedKey(data.key ?? null);
      setCreatedLabel(data.label ?? null);
      setLabel("");
      setMessage({ kind: "ok", text: "Key created — copy it now. It is shown only once." });
      await loadKeys();
    } catch {
      setMessage({ kind: "err", text: "Network error — please try again." });
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(key: KeyRow) {
    if (key.revokedAt) return;
    if (!window.confirm(`Revoke the API key "${key.label}"? It will stop working immediately.`)) return;
    const res = await fetch(`/api/admin/api-keys/${key.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMessage({ kind: "ok", text: "Key revoked." });
    else setMessage({ kind: "err", text: data.error ?? "Failed to revoke key" });
    await loadKeys();
  }

  return (
    <Card
      title="Public read-only API"
      subtitle={`Company-scoped API keys for ${companyName}. Use them to pull SOC, findings and actions into your own dashboard (read-only).`}
      className="mt-6"
    >
      {/* Create */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">Key label</label>
          <Input
            value={label}
            onChange={(v) => setLabel(v)}
            placeholder="e.g. Power BI daily sync"
          />
        </div>
        <Button onClick={createKey} loading={creating} disabled={!label.trim()}>
          Create key
        </Button>
      </div>

      {/* Show-once plaintext */}
      {createdKey ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800">New API key — copy it now, it will not be shown again</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs text-slate-800">{createdKey}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(createdKey).then(() => setMessage({ kind: "ok", text: "Key copied." }))}
            >
              Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-amber-700">
            Only its hash is retained. If you lose it, create a new key and revoke this one. Calls:{" "}
            <code className="font-mono">GET /api/public/v1/soc</code> via{" "}
            <code className="font-mono">Authorization: Bearer {createdKey.slice(0, 12)}…</code>
          </p>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-3 text-sm ${message.kind === "ok" ? "text-green-700" : "text-red-700"}`}>{message.text}</p>
      ) : null}

      {/* List */}
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Keys</h3>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-400">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{k.label}</span>
                    {k.revokedAt ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Revoked</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Active</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Created {new Date(k.createdAt).toLocaleString()}
                    {k.lastUsedAt ? ` · Last used ${new Date(k.lastUsedAt).toLocaleString()}` : " · Never used"}
                    {k.createdBy?.name ? ` · by ${k.createdBy.name}` : ""}
                  </div>
                </div>
                {!k.revokedAt ? (
                  <Button size="sm" variant="danger" onClick={() => revokeKey(k)}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Data returned is read-only, scoped to this company only. API keys never travel in client-data exports.
      </p>
    </Card>
  );
}
