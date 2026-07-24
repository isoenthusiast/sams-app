"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

export function HealthResetButton() {
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<{ lastReset: string | null; nextReset: string }>({ lastReset: null, nextReset: "" });

  useEffect(() => {
    fetch("/api/admin/reset-health")
      .then(r => r.json())
      .then(d => setStatus({ lastReset: d.lastReset, nextReset: d.nextReset }))
      .catch(() => {});
  }, []);

  const handleReset = async () => {
    if (!confirm("⚠️ Reset ALL control health scores to 0% across ALL companies?\n\nThis triggers the quarterly reset. Controls will return to 100% after their next assessment is completed.\n\nThis cannot be undone.")) return;
    if (!confirm("Are you absolutely sure? This affects all companies.")) return;

    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-health", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      showToast(`✅ Health scores reset for ${data.updated} controls`, "success");
      setStatus({ lastReset: new Date().toISOString(), nextReset: data.nextReset });
    } catch {
      showToast("Failed to reset health scores", "error");
    } finally {
      setResetting(false);
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <Card title="❤️ Control Health" padding="sm">
      <div className="space-y-1 mb-3 text-xs text-slate-500">
        {status.lastReset && <div>Last reset: <span className="font-medium text-slate-700">{fmt(status.lastReset)}</span></div>}
        {status.nextReset && <div>Next scheduled: <span className="font-medium text-slate-700">{fmt(status.nextReset)}</span></div>}
        {!status.lastReset && <div>No reset recorded yet.</div>}
      </div>
      <Button variant="danger" size="sm" disabled={resetting} onClick={handleReset}>
        {resetting ? "Resetting…" : "🔄 Reset All Health Scores"}
      </Button>
    </Card>
  );
}
