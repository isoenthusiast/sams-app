"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

export function HealthResetButton() {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!confirm("⚠️ Reset ALL control health scores to 0% across ALL companies?\n\nThis triggers the quarterly reset. Controls will return to 100% after their next assessment is completed.\n\nThis cannot be undone.")) return;
    if (!confirm("Are you absolutely sure? This affects all companies.")) return;

    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-health", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      showToast(`✅ Health scores reset for ${data.updated} controls`, "success");
    } catch {
      showToast("Failed to reset health scores", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card title="❤️ Control Health" padding="sm">
      <p className="text-xs text-slate-500 mb-3">
        Reset all control health scores to 0%. Controls recover to 100% after their next assessment.
      </p>
      <Button variant="danger" size="sm" disabled={resetting} onClick={handleReset}>
        {resetting ? "Resetting…" : "🔄 Reset All Health Scores"}
      </Button>
    </Card>
  );
}
