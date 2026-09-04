"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "./Button";
import { Card } from "./Card";

/**
 * SAMS-009 portal-admin Outbound Notifications settings card (client Admin).
 *
 * Set / clear the company's write-only webhook URL and send a test card. The URL
 * is NEVER displayed — after save the field is cleared and the status shows
 * "configured ✅" (the response only returns `{ configured }`). "Send test" posts
 * a test card and reports delivery. A cross-tenant or non-Admin caller gets 403
 * (enforced server-side in the API gate).
 */
export function PortalNotificationsSettingsCard({ companyId }: { companyId: string }) {
  const sp = useSearchParams();
  const companyParam = sp.get("companyId");

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBase = (path: string) => {
    const q = new URLSearchParams();
    if (companyParam) q.set("companyId", companyParam);
    if (companyId) q.set("companyId", companyId);
    const qs = q.toString();
    return `${path}${qs ? `?${qs}` : ""}`;
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase("/api/portal/notifications-settings"), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load settings");
      setConfigured(!!json.configured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [companyId, companyParam]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(apiBase("/api/portal/notifications-settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setConfigured(true);
      setUrl(""); // never echo the secret back
      setMessage({ kind: "ok", text: "Webhook saved (write-only)." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(apiBase("/api/portal/notifications-settings/test"), {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send test failed");
      setMessage({ kind: json.ok ? "ok" : "error", text: json.message });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Send test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function clear() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(apiBase("/api/portal/notifications-settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to clear");
      setConfigured(false);
      setUrl("");
      setMessage({ kind: "ok", text: "Webhook cleared — no further outbound posts." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Failed to clear" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Outbound notifications" className="mt-6">
      <p className="text-sm text-slate-500">
        Post in-app events to your company's incoming webhook (Slack / Teams legacy connector) so your process owners are
        reached where they work. The URL is write-only — it is never shown again after saving.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Status</span>
        {loading ? (
          <span className="text-sm text-slate-400">Loading…</span>
        ) : configured ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800">configured ✅</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold text-slate-600">not set</span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">Webhook URL</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="https://hooks.slack.com/services/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <Button variant="primary" onClick={save} loading={saving} disabled={!url.trim()}>
          Save
        </Button>
        <Button variant="secondary" onClick={sendTest} loading={testing} disabled={!configured}>
          Send test
        </Button>
        <Button variant="danger" onClick={clear} loading={saving} disabled={!configured}>
          Clear
        </Button>
      </div>

      {message && (
        <p role="status" className={`mt-3 text-sm ${message.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
