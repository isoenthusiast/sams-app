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
import { BadgesView } from "./BadgesView";
import { KnowledgebaseView } from "./KnowledgebaseView";
import { ExtractionView } from "./ExtractionView";
import { AssuranceProtocolView } from "./AssuranceProtocolView";
import { ProcessAreasAdminView } from "./ProcessAreasAdminView";
import { ControlsAdminView } from "./ControlsAdminView";
import { CompanyAdminView } from "./CompanyAdminView";
import { TemplateActivityTypesView } from "./TemplateActivityTypesView";
import { HealthResetButton } from "./HealthResetButton";
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

  // Activity log (for activity view)
  const activityLog = view === "activity"
    ? await prisma.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 50 })
    : [];

  // Users (for users view)
  const users = view === "users"
    ? await prisma.user.findMany({ orderBy: { name: "asc" }, include: { userCompanies: { include: { company: true } } } })
    : [];

  // Companies (for user management)
  const companies = view === "users"
    ? await prisma.company.findMany({ orderBy: { companyID: "asc" } })
    : [];

  // Templates (for templates view)
  const templates = view === "templates"
    ? await prisma.assessmentTemplate.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { controlLinkages: true } } } })
    : [];

  // Requirements (for requirements view)
  const requirements = view === "requirements"
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

  // Standards list (for requirements filter)
  const standards = view === "requirements"
    ? await prisma.standard.findMany({ orderBy: { standard: "asc" } })
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

  // Backlog items (for backlog Kanban view) — NOT company-scoped
  let backlogItems: any[] = [];
  if (view === "backlog") {
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Database Tables" value={Number(tableCount[0]?.count ?? 0)} />
        <StatCard label="Users" value={userCount} />
        <StatCard label="Controls" value={controlCount} />
        <StatCard label="Requirements" value={reqCount} />
        <StatCard label="Assessments" value={assessmentCount} />
        <StatCard label="Findings" value={findingCount} />
        <StatCard label="Actions" value={actionCount} />
        <StatCard label="KB Entries" value={kbCount} />
      </div>

      <div className="mt-6 border-b border-slate-200 flex gap-1">
        {[{ k: "dashboard", l: "📊 Dashboard" }, { k: "backlog", l: "📋 Backlog" }, { k: "activity", l: "📜 Activity Log" }, { k: "users", l: "👥 Users" }, { k: "companies", l: "🏢 Companies" }, { k: "templates", l: "📦 Templates" }, { k: "template-activities", l: "🔗 Template Activities" }, { k: "processareas", l: "🔄 Process Areas" }, { k: "controls", l: "🎛 Controls" }, { k: "requirements", l: "📋 Requirements" }, { k: "badges", l: "🏅 Badges" }, { k: "knowledgebase", l: "📚 Knowledgebase" }, { k: "extraction", l: "🤖 Extraction" }, { k: "assurance", l: "📝 Protocols" }].map((t) => (
          <Link key={t.k} href={`/admin?view=${t.k}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === t.k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.l}
          </Link>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {view === "dashboard" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="⚡ Quick Actions" padding="sm">
              <div className="flex flex-wrap gap-2">
                <Link href="/setup/process-areas"><Button variant="secondary" size="sm">Process Areas</Button></Link>
                <Link href="/admin/database"><Button variant="secondary" size="sm">Database</Button></Link>
                <Link href="/admin?view=users"><Button variant="secondary" size="sm">Users</Button></Link>
                <Link href="/admin?view=templates"><Button variant="secondary" size="sm">Templates</Button></Link>
                <Link href="/admin?view=activity"><Button variant="secondary" size="sm">Activity Log</Button></Link>
              </div>
            </Card>
            <Card title="📊 System Status" padding="sm">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Connected as</span><span className="font-medium">{session.user.name} (Admin)</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="font-medium">{companyId ?? "All"}</span></div>
              </div>
            </Card>
          </div>
          <HealthResetButton />

          {/* Two-column dashboard */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Process Health */}
            <div>
              {paByStandard.size > 0 ? (
                <Card title="📊 Process Health" subtitle="Control effectiveness by process area">
                  {[...paByStandard.entries()].map(([std, pas]) => (
                    <CollapsibleSection key={std} title={std} count={pas.length}>
                      {pas.map((pa: any) => (
                        <Link
                          key={pa.id}
                          href={`/setup/processdetails/${pa.id}`}
                          className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
                        >
                          <span className="text-sm text-slate-800">{pa.name}</span>
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            {pa.effective}/{pa.total}
                            <HealthIndicator score={pa.pct} size="sm" />
                          </span>
                        </Link>
                      ))}
                    </CollapsibleSection>
                  ))}
                </Card>
              ) : (
                <Card title="📊 Process Health" padding="sm">
                  <p className="text-sm text-slate-400 py-4">No process area data available.</p>
                </Card>
              )}
            </div>

            {/* Right: My Assessments + My Actions */}
            <div className="space-y-6">
              <Card title="📋 My Assessments" actions={<Link href="/fla/new" className="text-sm font-medium text-blue-700 hover:underline">+ New</Link>}>
                {myAssessments.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4">No assessments yet.</p>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {myAssessments.map((a: any) => (
                      <Link
                        key={a.id}
                        href={`/fla/${a.id}`}
                        className="flex items-center justify-between rounded-md border border-slate-100 px-4 py-3 hover:bg-slate-50"
                      >
                        <div>
                          <div className="text-sm font-medium text-slate-900">{a.name}</div>
                          <div className="text-xs text-slate-500">
                            {a.activityType.name} · {new Date(a.startDate).toLocaleDateString()} · {a._count.samples} samples · {a._count.findings} findings
                          </div>
                        </div>
                        <span className="text-slate-300">→</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="✅ My Actions" subtitle={myActions.length > 0 ? `${myActions.length} assigned` : ""}>
                {myActions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4">No actions assigned to you.</p>
                ) : (
                  <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                    {myActions.map((act: any) => (
                      <ActionRowClient key={act.id} action={act} />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity Log ── */}
      {view === "activity" && (
        <div className="mt-6">
          <p className="text-sm text-slate-500 mb-4">Last 50 activity log entries</p>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-slate-200 pb-2 mb-1 text-xs font-medium text-slate-500">
                <span className="w-36 flex-shrink-0">Timestamp</span>
                <span className="w-28 flex-shrink-0">Type</span>
                <span className="flex-1 min-w-0">Description</span>
                <span className="w-24 flex-shrink-0 text-right">User</span>
              </div>
              {activityLog.map((log) => (
                <div key={log.id} className="flex items-start gap-3 border-b border-slate-50 py-2 text-sm">
                  <span className="w-36 flex-shrink-0 text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                  <span className="w-28 flex-shrink-0 text-xs font-medium text-slate-600">{log.activityType}</span>
                  <span className="flex-1 min-w-0 text-slate-700 truncate" title={log.description}>{log.description}</span>
                  <span className="w-24 flex-shrink-0 text-xs text-slate-400 text-right">{log.username}</span>
                </div>
              ))}
            </div>
          </div>
          {activityLog.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>}
        </div>
      )}

      {/* ── Users ── */}
      {view === "users" && (
        <UserManager
          initialUsers={users}
          companies={companies}
          currentUserId={(session.user as any)?.id}
        />
      )}

      {/* ── Templates ── */}
      {view === "templates" && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-500 mb-2">{templates.length} template(s)</p>
          {templates.map((t) => (
            <Card key={t.id} padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">{t.name}</div>
                  {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                </div>
                <div className="text-xs text-slate-400">{t._count.controlLinkages} controls</div>
              </div>
            </Card>
          ))}
          {templates.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No templates found.</p>}
        </div>
      )}

      {/* ── Requirements ── */}
      {view === "requirements" && <RequirementsView requirements={requirements} standards={standards} />}

      {/* ── Badges ── */}
      {view === "badges" && <BadgesView badges={badges} />}

      {/* ── Knowledgebase ── */}
      {view === "knowledgebase" && <KnowledgebaseView entries={kbEntries} processAreas={processAreas} companyId={companyId} />}

      {/* ── Document Extraction ── */}
      {view === "extraction" && <ExtractionView />}

      {/* ── Assurance Protocols ── */}
      {view === "assurance" && <AssuranceProtocolView />}

      {/* ── Companies ── */}
      {view === "companies" && <CompanyAdminView />}

      {/* ── Template Activity Types ── */}
      {view === "template-activities" && <TemplateActivityTypesView />}

      {/* ── Process Areas Admin ── */}
      {view === "processareas" && <ProcessAreasAdminView />}

      {/* ── Controls Admin ── */}
      {view === "controls" && <ControlsAdminView />}

      {/* ── Backlog Kanban ── */}
      {view === "backlog" && (
        <div className="mt-6">
          <KanbanBoard initialItems={backlogItems} />
        </div>
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
