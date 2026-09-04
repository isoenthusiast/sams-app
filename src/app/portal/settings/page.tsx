import { getPortalContext, type PortalPageSearchParams } from "@/lib/portal-server";
import { PortalThemeSettings } from "@/components/PortalThemeSettings";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { PortalNotificationsSettingsCard } from "@/components/PortalNotificationsSettingsCard";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

/**
 * /portal/settings — client-Admin company settings (SAMS-010 white-label theming
 * + SAMS-009 outbound notifications, merged on one page).
 *
 * Client Admin only. Two cards (same card family):
 *   - PortalThemeSettings (SAMS-010): set the ACTIVE company's logo URL + accent
 *     colour with a live preview and save/clear. The active company is the
 *     session user's resolved portal company, so a card only ever themes a
 *     company the caller belongs to.
 *   - PortalNotificationsSettingsCard (SAMS-009): set/clear the company's
 *     WRITE-ONLY webhook URL + "Send test". The URL is never displayed.
 * Non-Admin roles are turned away (the write routes also enforce 403 server-side);
 * a user with no company context gets the guided empty state. The webhook URL is
 * never rendered or returned.
 */
export default async function PortalSettingsPage({ searchParams }: { searchParams: PortalPageSearchParams }) {
  const ctx = await getPortalContext(searchParams);
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  if (ctx.userRole !== "Admin") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Card title="Company settings">
          <p className="text-sm text-slate-600">Company settings are available to client Admins only. Contact your administrator if you need to update portal branding or outbound notifications.</p>
        </Card>
      </div>
    );
  }

  const active = ctx.companies.find((c) => c.id === ctx.companyId) ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mb-6 text-sm text-slate-600">Company branding and outbound notification delivery.</p>
      <div className="max-w-2xl">
        <PortalThemeSettings
          companyId={ctx.companyId}
          companyName={active?.companyName ?? "your company"}
          initialLogoUrl={active?.logoUrl ?? ""}
          initialPrimaryColor={active?.primaryColor ?? ""}
        />
        <PortalNotificationsSettingsCard companyId={ctx.companyId} />
      </div>
    </div>
  );
}
