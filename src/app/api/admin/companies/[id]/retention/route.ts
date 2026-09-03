import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * POST /api/admin/companies/[id]/retention
 *
 * Data Trust Gate retention state machine (T3):
 *   - archive:          set Company.archivedAt → hide from selectors + block logins.
 *   - schedule-delete:  set Company.deletionScheduledAt → 30-day safety net begins
 *                       (a company must be archived first).
 *   - reinstate:        clear both timestamps, restore access, audit-logged.
 *
 * Authorized: Admin, or Provider. Provider calls are audit-logged with a context
 * row. Hard delete is NOT here — it is the manual scripts/db/company_hard_delete.ts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as
    | { id?: string; name?: string; role?: string; providerRole?: string | null }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = user.role === "Admin";
  const isProviderUser = !!user.providerRole;
  if (!isAdmin && !isProviderUser) {
    return NextResponse.json({ error: "Admin or provider access required" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action;
  if (!action || !["archive", "schedule-delete", "reinstate"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: archive, schedule-delete, reinstate" },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  if (company.companyID === "SAMS001") {
    return NextResponse.json(
      { error: "The SAMS001 master company cannot be archived or deleted" },
      { status: 400 }
    );
  }

  let data: { archivedAt?: Date | null; deletionScheduledAt?: Date | null };
  switch (action) {
    case "archive":
      if (company.archivedAt) {
        return NextResponse.json({ error: "Company is already archived" }, { status: 409 });
      }
      data = { archivedAt: new Date() };
      break;
    case "schedule-delete":
      if (!company.archivedAt) {
        return NextResponse.json(
          { error: "Company must be archived before scheduling deletion" },
          { status: 409 }
        );
      }
      if (company.deletionScheduledAt) {
        return NextResponse.json({ error: "Deletion already scheduled" }, { status: 409 });
      }
      data = { deletionScheduledAt: new Date() };
      break;
    case "reinstate":
      if (!company.archivedAt && !company.deletionScheduledAt) {
        return NextResponse.json({ error: "Company is not archived or pending deletion" }, { status: 409 });
      }
      data = { archivedAt: null, deletionScheduledAt: null };
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updated = await prisma.company.update({ where: { id }, data });

  const auditType =
    action === "archive"
      ? "COMPANY_ARCHIVED"
      : action === "schedule-delete"
        ? "COMPANY_SCHEDULE_DELETE"
        : "COMPANY_REINSTATE";
  await logActivity({
    activityType: auditType,
    description: `${user.name ?? user.id ?? "unknown"} ${action} company ${company.companyName} (${company.companyID})`,
    username: user.name ?? user.id ?? "unknown",
    refTable: "Company",
    refRecord: company.id,
    beforeData: { archivedAt: company.archivedAt?.toISOString() ?? null, deletionScheduledAt: company.deletionScheduledAt?.toISOString() ?? null },
    afterData: {
      archivedAt: updated.archivedAt?.toISOString() ?? null,
      deletionScheduledAt: updated.deletionScheduledAt?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ company: updated });
}
