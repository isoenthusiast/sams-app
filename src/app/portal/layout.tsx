import { auth } from "@/auth";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { PortalHeader } from "@/components/PortalHeader";
import { ContentBanner } from "@/components/ContentBanner";
import { resolvePortalCompanyId } from "@/lib/portal";
import type { PortalCompany } from "@/lib/portal";

export const dynamic = "force-dynamic";

/**
 * SAMS-005 portal layout: simplified chrome (no admin/operator nav — the root
 * layout suppresses NavBar/MobileNav for /portal via the x-portal-route header).
 * Renders the company header + card-grid nav, then the page.
 *
 * SAMS-010 / SAMS-007 (Conan round-1 finding #1): the ACTIVE company is resolved
 * SERVER-SIDE here with the same rule the portal pages use — `resolvePortalCompanyId`
 * (cookie > home > first; the layout cannot see a page's ?companyId= search param,
 * so the param is handled client-side in PortalHeader, which stays param-primary so
 * header and page never diverge). The resolved id is passed down as `activeCompanyId`
 * so the header themes/selects ONLY that company — never a divergent `companies[0]`
 * fallback, which previously leaked company A's theme onto a company-B page for a
 * multi-company portal user.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  const userName = (session?.user as { name?: string })?.name ?? "Client";
  const userRole = (session?.user as { role?: string })?.role ?? "Assessor";
  const providerRole = (session?.user as { providerRole?: string | null })?.providerRole ?? null;

  let companies: PortalCompany[] = [];
  let activeCompanyId: string | null = null;
  if (userId) {
    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get("selectedCompanyId")?.value ?? null;
    const resolved = await resolvePortalCompanyId({
      userId,
      providerRole,
      selectedCompanyId: null, // the layout can't see the page's ?companyId=; the header reconciles it client-side
      cookieCompanyId,
    });
    companies = resolved.companies;
    activeCompanyId = resolved.companyId;
  }

  return (
    <>
      <Suspense fallback={<header className="border-b border-slate-200 bg-white h-12" />}>
        <PortalHeader
          companies={companies}
          activeCompanyId={activeCompanyId}
          userName={userName}
          userRole={userRole}
        />
      </Suspense>
      {activeCompanyId ? (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <ContentBanner />
        </div>
      ) : null}
      {children}
    </>
  );
}
