import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CompanySelector } from "./CompanySelector";
import { SignOutButton } from "./SignOutButton";

export async function NavBar() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = (session.user as { id?: string }).id;
  const role = (session.user as { role?: string }).role ?? "Assessor";
  const isAdmin = role === "Admin";

  const userCompanies = userId
    ? await prisma.userCompany.findMany({ where: { userId }, include: { company: true } })
    : [];
  const companies = userCompanies
    .filter((uc) => uc.company != null)
    .map((uc) => ({
      id: uc.company.id,
      companyID: uc.company.companyID,
      companyName: uc.company.companyName,
    }));

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-slate-900">SAMS</Link>
          <CompanySelector companies={companies} isAdmin={isAdmin} />
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {isAdmin ? (
              <>
                <NavLink href="/admin">Dashboard</NavLink>
                <NavLink href="/setup/process-areas">Setup</NavLink>
                <NavLink href="/admin">Admin</NavLink>
                <NavLink href="/help">Help</NavLink>
              </>
            ) : (
              <>
                <NavLink href="/fla">Dashboard</NavLink>
                <NavLink href="/fla">My Work</NavLink>
                <NavLink href="/setup/process-areas">Process Areas</NavLink>
                <NavLink href="/help">Help</NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {(session.user as { name?: string }).name} ({role})
          </span>
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
