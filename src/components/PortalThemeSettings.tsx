"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * SAMS-010 white-label theming settings card (settled decision #3).
 *
 * Client Admin manages the ACTIVE company's `logoUrl` + `primaryColor` with a
 * live preview, then Save / Clear. Both fields are additive nullable; Clear
 * reverts to the SAMS default. The write goes to PATCH /api/portal/company/theme
 * (scope-by-construction: the server resolves the company from the session).
 */
export function PortalThemeSettings({
  companyId,
  companyName,
  initialLogoUrl,
  initialPrimaryColor,
}: {
  companyId: string;
  companyName: string;
  initialLogoUrl: string;
  initialPrimaryColor: string;
}) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [logoFailed, setLogoFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => setLogoFailed(false), [logoUrl]);

  // Hex + swatch stay in sync; keep a valid hex for the colour picker.
  const swatchValue = HEX_COLOR.test(primaryColor) ? primaryColor : "#1e40af";

  const previewColor = useMemo(() => (HEX_COLOR.test(primaryColor) ? primaryColor : "#1e40af"), [primaryColor]);
  const canSave = logoUrl.trim() === "" || /^https:\/\/\S+$/i.test(logoUrl.trim());
  const hasTheme = !!(logoUrl.trim() || primaryColor.trim());

  async function save(clear: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/portal/company/theme?companyId=${encodeURIComponent(companyId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { clear: true } : { logoUrl: logoUrl.trim() || null, primaryColor: primaryColor.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error ?? "Save failed" });
        setSaving(false);
        return;
      }
      setMessage({ kind: "ok", text: clear ? "Reverted to the SAMS default." : "Saved — the portal now uses your branding." });
      if (clear) {
        setLogoUrl("");
        setPrimaryColor("");
      }
      router.refresh();
    } catch {
      setMessage({ kind: "err", text: "Network error — please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Portal branding" subtitle={`Branding for the ${companyName} client portal`}>
      <div className="space-y-5">
        {/* Live preview (mirrors PortalHeader: logo w/ text fallback + --brand accent) */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Preview</p>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                {logoUrl.trim() && !logoFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl.trim()} alt={`${companyName} logo`} className="h-9 w-auto max-w-40 object-contain" onError={() => setLogoFailed(true)} />
                ) : (
                  <span className="text-lg font-bold text-slate-900">Client Portal</span>
                )}
                <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">{companyName}</span>
              </div>
              <span className="text-sm text-slate-600">Preview</span>
            </div>
            <div className="flex flex-wrap gap-1 p-3">
              {["Overview", "Findings", "Actions", "Requests", "Activity"].map((label) => (
                <span key={label} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: previewColor }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Input
              label="Logo URL"
              type="url"
              placeholder="https://your-client.com/logo.png"
              helperText="https only. If the image fails to load, the portal falls back to the text mark."
              error={logoUrl.trim() !== "" && !/^https:\/\/\S+$/i.test(logoUrl.trim()) ? "Logo URL must be https." : undefined}
              value={logoUrl}
              onChange={setLogoUrl}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Accent colour <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={swatchValue}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Accent colour swatch"
                className="h-10 w-14 shrink-0 cursor-pointer rounded-md border border-slate-300"
              />
              <Input
                type="text"
                placeholder="#1e40af"
                value={primaryColor}
                onChange={setPrimaryColor}
                error={primaryColor.trim() !== "" && !HEX_COLOR.test(primaryColor.trim()) ? "Use #RRGGBB (e.g. #1e40af)." : undefined}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">Drives the portal accent via the <code>--brand</code> variable.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => save(false)} loading={saving} disabled={!canSave}>
            Save
          </Button>
          {hasTheme && (
            <Button variant="secondary" onClick={() => save(true)} disabled={saving}>
              Clear
            </Button>
          )}
        </div>

        {message && (
          <p role="status" className={`text-sm ${message.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
