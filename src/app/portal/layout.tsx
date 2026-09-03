import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { PortalHeader } from "@/components/PortalHeader";
import type { PortalCompany } from "@/lib/portal";

export const dynamic = "force-dynamic";

/**
 * SAMS-005 portal layout: simplified chrome (no admin/operator nav — the root
 * layout suppresses NavBar/MobileNav for /portal via the x-portal-route header).
 * Renders the company header + card-grid nav, then the page.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  const userName = (session?.user as { name?: string })?.name ?? "Client";
  const userRole = (session?.user as { role?: string })?.role ?? "Assessor";

  let companies: PortalCompany[] = [];
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, userCompanies: { include: { company: true } } },
    });
    const map = new Map<string, PortalCompany>();
    if (user?.companyId) {
      const c = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, companyID: true, companyName: true },
      });
      if (c) map.set(c.id, c);
    }
    for (const uc of user?.userCompanies ?? []) {
      if (uc.company && uc.company.archivedAt == null) {
        map.set(uc.company.id, { id: uc.company.id, companyID: uc.company.companyID, companyName: uc.company.companyName });
      }
    }
    companies = Array.from(map.values());
  }

  return (
    <>
      <Suspense fallback={<header className="border-b border-slate-200 bg-white h-12" />}>
        <PortalHeader companies={companies} userName={userName} userRole={userRole} />
      </Suspense>
      {children}
    </>
  );
}
