import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { HealthIndicator } from "@/components/HealthIndicator";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { ActionRowClient } from "@/components/ActionRowClient";
import { RequirementsView } from "./RequirementsView";
import { BadgesAdminView } from "./BadgesAdminView";
import { KnowledgebaseView } from "./KnowledgebaseView";
import { ExtractionView } from "./ExtractionView";
import { AssuranceProtocolView } from "./AssuranceProtocolView";
import { ProcessAreasAdminView } from "./ProcessAreasAdminView";
import { ControlsAdminView } from "./ControlsAdminView";
import { StandardsManagementView } from "./StandardsManagementView";
import { CompanyManagementView } from "./CompanyManagementView";
import { TemplatesManagementView } from "./TemplatesManagementView";
import { GamificationManagementView } from "./GamificationManagementView";
import { KnowledgebaseManagementView } from "./KnowledgebaseManagementView";
import { SysAdminManagementView } from "./SysAdminManagementView";
import { AuditChecklistTemplateAdminView } from "@/components/AuditChecklistTemplateAdminView";
import { TemplateActivityTypesView } from "./TemplateActivityTypesView";
import { HealthResetButton } from "./HealthResetButton";
import { ManagerAssignmentView } from "./ManagerAssignmentView";
import { KanbanBoard } from "@/components/KanbanBoard";
import { UserManager } from "@/components/UserManager";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") redirect("/fla");
  const companyId = await getSelectedCompanyId();
  const sp = await searchParams;
  const view = sp.view ?? "dashboard";

  const where = companyId ? { companyId } : {};
  const [tableCount, userCount, controlCount, assessmentCount] =
    await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`),
      prisma.user.count(),
      prisma.control.count({ where }),
      prisma.assessment.count({ where }),
    ]);

  // These counts may fail if the underlying tables have schema drift — fall back to 0.
  let reqCount = 0;
  let findingCount = 0;
  let actionCount = 0;
  let kbCount = 0;
  try { reqCount = await prisma.requirement.count({ where }); } catch {}
  try { findingCount = await prisma.finding.count({ where: { assessment: where } }); } catch {}
  try { actionCount = await prisma.action.count({ where: { finding: { assessment: where } } }); } catch {}
  try {
    const kb = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM "Knowledgebase"` + (companyId ? ` WHERE "companyId" = '${companyId}'` : "")
    );
    kbCount = Number(kb[0]?.count ?? 0);
  } catch {}

  // Activity log (for sysadmin view)
  const activityLog = view === "sysadmin"
    ? await prisma.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 50 })
    : [];

  // Users (for sysadmin view)
  const users = view === "sysadmin"
    ? await prisma.user.findMany({ orderBy: { name: "asc" }, include: { userCompanies: { include: { company: true } } } })
    : [];

  // Companies (for sysadmin + standards filter + knowledgebase + templates)
  const companies = (view === "sysadmin" || view === "standards" || view === "knowledgebase" || view === "templates")
    ? await prisma.company.findMany({ orderBy: { companyID: "asc" } })
    : [];

  // Departments & Positions (for sysadmin view)
  const departments = view === "sysadmin"
    ? await prisma.department.findMany({ select: { id: true, name: true, companyId: true }, orderBy: { name: "asc" } })
    : [];
  const positions = view === "sysadmin"
    ? await prisma.position.findMany({ select: { id: true, title: true, departmentId: true }, orderBy: { title: "asc" } })
    : [];

  // Manager assignment data
  const mgrUsers = view === "manager-assignment"
    ? await prisma.$queryRawUnsafe<Array<{ id: string; name: string; username: string; managerName: string | null; managerUsername: string | null }>>(
        `SELECT id, name, username, "managerName", "managerUsername" FROM "User" ORDER BY name`)
    : [];
  const allUsernames = view === "manager-assignment"
    ? (await prisma.$queryRawUnsafe<Array<{ username: string }>>(`SELECT username FROM "User" ORDER BY username`)).map(r => r.username)
    : [];

  // Templates (for templates view)
  const templates = view === "templates"
    ? await prisma.assessmentTemplate.findMany({
        where,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { controlLinkages: true } },
          controlLinkages: { include: { control: true } },
        },
      })
    : [];

  // All controls with PA info (for template control selection)
  const allControlsForTemplates = view === "templates"
    ? await prisma.control.findMany({
        include: { processArea: { include: { standardRef: { select: { id: true, standard: true } } } } },
        orderBy: { name: "asc" },
      })
    : [];

  // Standards & Process Areas (for template control filter dropdowns)
  const allStandardsForTemplates = view === "templates"
    ? await prisma.standard.findMany({ orderBy: { standard: "asc" } })
    : [];
  const allPAsForTemplates = view === "templates"
    ? await prisma.processArea.findMany({ include: { standardRef: { select: { id: true, standard: true } } }, orderBy: { name: "asc" } })
    : [];

  // Activity types (for templates view)
  const activityTypes = view === "templates"
    ? await prisma.assuranceActivityType.findMany({ orderBy: { name: "asc" } })
    : [];

  // Requirements (for requirements view + standards management)
  const requirements = (view === "requirements" || view === "standards")
    ? (await prisma.requirement.findMany({
        where,
        include: {
          processArea: { include: { standardRef: true } },
          controlMappings: { include: { control: true } },
        },
        orderBy: [{ processArea: { standardRef: { sequenceNo: "asc" } } }, { requirementId: "asc" }],
      })).map((r) => ({
        rId: r.rId,
        requirementId: r.requirementId,
        clauseContent: r.clauseContent,
        standard: r.processArea?.standardRef?.standard ?? r.standard ?? "Unknown",
        processAreaName: r.processArea?.name ?? "Unknown",
        processAreaId: r.processArea?.id ?? "",
        controls: r.controlMappings.map((c) => ({ id: c.control.id, name: c.control.name, controlType: c.control.controlType })),
      }))
    : [];

  // Standards list (company-filtered for standards management + knowledgebase)
  const allStandards = (view === "requirements" || view === "standards" || view === "knowledgebase")
    ? await prisma.standard.findMany({ where, orderBy: { sequenceNo: "asc" } })
    : [];

  // Process areas with standard info (company-filtered for standards management)
  const allProcessAreas = view === "standards"
    ? await prisma.processArea.findMany({ where, include: { standardRef: true }, orderBy: { name: "asc" } })
    : [];

  // Controls with PA info (company-filtered for standards management)
  const allControls = view === "standards"
    ? await prisma.control.findMany({ where, include: { processArea: { include: { standardRef: { select: { standard: true } } } } }, orderBy: { name: "asc" } })
    : [];

  // Simple PA list for control form dropdown
  const paList = view === "standards"
    ? await prisma.processArea.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  // Badges (for badges view)
  const badges = view === "badges"
    ? (await prisma.achievementBadge.findMany({
        include: { _count: { select: { userAchievements: true } } },
        orderBy: { badgeName: "asc" },
      })).map((b) => ({
        id: b.id,
        badgeName: b.badgeName,
        description: b.description,
        rarity: b.rarity,
        earnedCount: b._count.userAchievements,
      }))
    : [];

  // Knowledgebase entries (for knowledgebase view)
  const kbEntries = view === "knowledgebase"
    ? (await prisma.$queryRawUnsafe<Array<{ kID: string; knowledgeName: string; knowledgeContent: string; remarks: string | null; createdDate: string; addedBy: string; processAreaId: string | null; processAreaName: string | null }>>(
        `SELECT kb."kID", kb."knowledgeName", kb."knowledgeContent", kb."remarks", kb."createdDate"::text, kb."addedBy", kb."processAreaId", pa.name as "processAreaName"
         FROM "Knowledgebase" kb
         LEFT JOIN "ProcessArea" pa ON pa.id = kb."processAreaId"
         ${companyId ? `WHERE kb."companyId" = '${companyId}'` : ""}
         ORDER BY kb."createdDate" DESC`
      ))
    : [];

  // Process areas list (for KB upload filter)
  const processAreas = view === "knowledgebase"
    ? await prisma.processArea.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  // Backlog items (for backlog Kanban view + dashboard widget) — NOT company-scoped
  let backlogItems: any[] = [];
  if (view === "dashboard" || view === "backlog") {
    try {
      backlogItems = await prisma.backlogItem.findMany({
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });
    } catch (e) { console.error("Backlog fetch error:", e); }
  }

  // Process Health data (for dashboard view)
  let paHealth: any[] = [];
  let paByStandard = new Map<string, any[]>();
  let myAssessments: any[] = [];
  let myActions: any[] = [];
  if (view === "dashboard") {
    try {
      const pas = await prisma.processArea.findMany({
        where,
        include: {
          standardRef: true,
          controls: {
            include: {
              controlAssignments: {
                where: { effective: { not: null } },
                orderBy: { createdAt: "desc" },
                take: 100,
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
      paHealth = pas.map((pa: any) => {
        const total = pa.controls.length;
        const effective = pa.controls.filter((c: any) =>
          c.controlAssignments.some((ca: any) => ca.effective === "Effective")
        ).length;
        return { ...pa, total, effective, pct: total > 0 ? Math.round((effective / total) * 100) : 0 };
      });
      for (const pa of paHealth) {
        const std = pa.standardRef?.standard ?? pa.standard ?? "Other";
        if (!paByStandard.has(std)) paByStandard.set(std, []);
        paByStandard.get(std)!.push(pa);
      }
    } catch { /* process health is optional */ }

    // Admin's My Assessments + My Actions
    const adminUserId = (session.user as any).id;
    const adminName = (session.user as any).name;
    try {
      myAssessments = await prisma.assessment.findMany({
        where: { assessorId: adminUserId, ...(companyId ? { companyId } : {}) },
        include: { activityType: true, _count: { select: { samples: true, findings: true } } },
        orderBy: { startDate: "desc" },
        take: 10,
      });
    } catch {}
    try {
      if (adminName) {
        myActions = await prisma.action.findMany({
          where: { actionParty: adminName },
          include: {
            finding: {
              include: {
                assessment: { include: { activityType: true, assessor: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdDate: "desc" },
          take: 20,
        });
      }
    } catch {}
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">System overview and management</p>
        </div>
      </div>

      <div className="border-b border-slate-200 flex flex-wrap gap-x-1">
        {[{ k: "dashboard", l: "📊 Dashboard" }, { k: "standards", l: "📐 Standards" }, { k: "templates", l: "📦 Templates" }, { k: "knowledgebase", l: "📚 Knowledgebase" }, { k: "sysadmin", l: "⚙️ SysAdmin" }].map((t) => (
          <Link key={t.k} href={`/admin?view=${t.k}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === t.k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.l}
          </Link>
        ))}
      </div>

      {view === "dashboard" && (
      <>
      <details open className="mt-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900 select-none">
          📊 System Overview — click to collapse
        </summary>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-3">
          <StatCard label="Database Tables" value={Number(tableCount[0]?.count ?? 0)} />
          <StatCard label="Users" value={userCount} />
          <StatCard label="Controls" value={controlCount} />
          <StatCard label="Requirements" value={reqCount} />
          <StatCard label="Assessments" value={assessmentCount} />
          <StatCard label="Findings" value={findingCount} />
          <StatCard label="Actions" value={actionCount} />
          <StatCard label="KB Entries" value={kbCount} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <Card title="⚡ Quick Actions" padding="sm">
            <div className="flex flex-wrap gap-2">
              <Link href="/setup/process-areas"><Button variant="secondary" size="sm">Process Areas</Button></Link>
              <Link href="/admin/database"><Button variant="secondary" size="sm">Database</Button></Link>
              <Link href="/admin?view=sysadmin"><Button variant="secondary" size="sm">Users</Button></Link>
              <Link href="/admin?view=templates"><Button variant="secondary" size="sm">Templates</Button></Link>
              <Link href="/admin?view=sysadmin"><Button variant="secondary" size="sm">SysAdmin</Button></Link>
              <Link href="/admin?view=audit-checklist-templates"><Button variant="secondary" size="sm">📋 Audit Checklists</Button></Link>
            </div>
          </Card>
          <Card title="📊 System Status" padding="sm">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Connected as</span><span className="font-medium">{session.user.name} (Admin)</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="font-medium">{companyId ?? "All"}</span></div>
            </div>
          </Card>
        </div>
        <div className="mt-4">
          <HealthResetButton />
        </div>
      </details>

      {/* ── Backlog Widget (on Dashboard) ── */}
      <details open className="mt-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900 select-none">
          📋 Backlog — click to collapse
        </summary>
        <div className="mt-3">
          <KanbanBoard initialItems={backlogItems} />
        </div>
      </details>
      </>
      )}

      {/* ── Dashboard ── (stats, quick actions, system status, and control health are now in the collapsible System Statistics above) */}

      {/* ── SysAdmin ── */}
      {view === "sysadmin" && (
        <SysAdminManagementView
          activityLog={activityLog}
          users={users}
          companies={companies}
          currentUserId={(session.user as any)?.id}
          departments={JSON.parse(JSON.stringify(departments))}
          positions={JSON.parse(JSON.stringify(positions))}
        />
      )}

      {/* ── Manager Assignment ── */}
      {view === "manager-assignment" && (
        <ManagerAssignmentView
          users={JSON.parse(JSON.stringify(mgrUsers))}
          allUsernames={allUsernames}
        />
      )}

      {/* ── Standards ── */}
      {view === "standards" && (
        <StandardsManagementView
          standards={allStandards}
          processAreas={JSON.parse(JSON.stringify(allProcessAreas))}
          requirements={JSON.parse(JSON.stringify(requirements))}
          allStandards={allStandards}
          controls={JSON.parse(JSON.stringify(allControls))}
          controlPas={JSON.parse(JSON.stringify(paList))}
          companies={JSON.parse(JSON.stringify(companies))}
        />
      )}

      {/* ── Templates ── */}
      {view === "templates" && (
        <div className="mt-6 space-y-8">
          <TemplatesManagementView
            templates={JSON.parse(JSON.stringify(templates))}
            activityTypes={JSON.parse(JSON.stringify(activityTypes))}
            allControls={JSON.parse(JSON.stringify(allControlsForTemplates))}
            allStandards={JSON.parse(JSON.stringify(allStandardsForTemplates))}
            allProcessAreas={JSON.parse(JSON.stringify(allPAsForTemplates))}
            companies={JSON.parse(JSON.stringify(companies))}
            selectedCompanyId={companyId ?? ""}
            isAdmin={true}
          />
          <hr className="border-slate-200" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">📋 Audit Checklist Templates</h2>
            <AuditChecklistTemplateAdminView />
          </div>
        </div>
      )}

      {/* ── Audit Checklist Templates ── */}
      {view === "audit-checklist-templates" && (
        <div className="mt-6">
          <AuditChecklistTemplateAdminView />
        </div>
      )}

      {/* ── Knowledgebase ── */}
      {view === "knowledgebase" && (
        <KnowledgebaseManagementView
          entries={kbEntries}
          processAreas={JSON.parse(JSON.stringify(processAreas))}
          companyId={companyId}
          companies={JSON.parse(JSON.stringify(companies))}
          standards={JSON.parse(JSON.stringify(allStandards))}
        />
      )}

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card padding="sm">
      <div className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}
