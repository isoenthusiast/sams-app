"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const pathname = usePathname();
  const isAssessor = !pathname.startsWith("/admin");

  const tabs = isAssessor
    ? [
        { href: "/fla", label: "📊", title: "Dashboard" },
        { href: "/fla/new", label: "➕", title: "New" },
        { href: "/setup/process-areas", label: "📋", title: "Areas" },
        { href: "/help", label: "❓", title: "Help" },
      ]
    : [
        { href: "/admin", label: "📊", title: "Admin" },
        { href: "/setup/process-areas", label: "📋", title: "Areas" },
        { href: "/admin?view=users", label: "👥", title: "Users" },
        { href: "/help", label: "❓", title: "Help" },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white md:hidden" aria-label="Mobile navigation">
      <div className="flex justify-around">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== "/" && pathname.startsWith(t.href));
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center py-2 px-3 text-xs font-medium transition-colors ${
                active ? "text-blue-800" : "text-slate-500 hover:text-slate-700"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-lg">{t.label}</span>
              <span>{t.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
