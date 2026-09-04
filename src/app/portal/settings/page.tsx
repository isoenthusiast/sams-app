import { getPortalContext } from "@/lib/portal-server";
import { PortalThemeSettings } from "@/components/PortalThemeSettings";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

/**
 * /portal/settings — SAMS-010 white-label theming (settled decision #3).
 *
 * Client Admin only: a settings card (same card family as the SAMS-009 webhook
 * settings) to set the ACTIVE company's logo URL + accent colour, with a live
 * preview and save/clear. Non-Admin roles are turned away (the write route also
 * enforces 403 as a hard gate — this is the UI-side guard). The active company
 * is the session user's resolved portal company, so the card only ever themes a
 * company the caller belongs to.
 */
export default async function PortalSettingsPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const ctx = await getPortalContext(searchParams);
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  if (ctx.userRole !== "Admin") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Card title="Company settings">
          <p className="text-sm text-slate-600">Company settings are available to client Admins only. Contact your administrator if you need to update the portal branding.</p>
        </Card>
      </div>
    );
  }

  const active = ctx.companies.find((c) => c.id === ctx.companyId) ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mb-6 text-sm text-slate-600">Branding for your client portal.</p>
      <div className="max-w-2xl">
        <PortalThemeSettings
          companyId={ctx.companyId}
          companyName={active?.companyName ?? "your company"}
          initialLogoUrl={active?.logoUrl ?? ""}
          initialPrimaryColor={active?.primaryColor ?? ""}
        />
      </div>
    </div>
  );
}
