import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Suspense } from "react";
import { CompanySelector } from "./CompanySelector";
import { SignOutButton } from "./SignOutButton";

export async function NavBar() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = (session.user as { id?: string }).id;
  const role = (session.user as { role?: string }).role ?? "Assessor";
  const isAdmin = role === "Admin";
  const providerRole = (session.user as { providerRole?: string | null }).providerRole;

  // Providers span all clients: list EVERY company (ordered by companyID) in the
  // selector so a provider with few or no UserCompany mappings can still switch
  // via the in-app selector (SAMS-002b). Server-side access enforcement is
  // unchanged — the provider plane is read-only and mutations stay role-gated.
  // Non-providers keep the UserCompany-mapping list, byte-for-byte as before.
  let companies: { id: string; companyID: string; companyName: string }[] = [];
  if (providerRole) {
    const all = await prisma.company.findMany({
      orderBy: { companyID: "asc" },
      select: { id: true, companyID: true, companyName: true },
    });
    companies = all.map((c) => ({ id: c.id, companyID: c.companyID, companyName: c.companyName }));
  } else {
    const userCompanies = userId
      ? await prisma.userCompany.findMany({ where: { userId }, include: { company: true } })
      : [];
    companies = userCompanies
      .filter((uc) => uc.company != null)
      .map((uc) => ({
        id: uc.company.id,
        companyID: uc.company.companyID,
        companyName: uc.company.companyName,
      }));
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-slate-900">SAMS</Link>
          <Suspense fallback={<span className="text-sm text-slate-400">Loading…</span>}>
            <CompanySelector companies={companies} isAdmin={isAdmin} providerRole={providerRole} />
          </Suspense>
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {isAdmin ? (
              <>
                <NavLink href="/fla">Dashboard</NavLink>
                <NavLink href="/admin">Admin</NavLink>
                <NavLink href="/help">Help</NavLink>
              </>
            ) : (
              <>
                <NavLink href="/fla">Dashboard</NavLink>
                <NavLink href="/fla">My Work</NavLink>
                <NavLink href="/help">Help</NavLink>
              </>
            )}
            {providerRole ? <NavLink href="/operator">Operator</NavLink> : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/profile" className="text-sm text-slate-600 hover:text-slate-900 hover:underline transition-colors">
            {(session.user as { name?: string }).name} ({role})
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
      {children}
    </Link>
  );
}
