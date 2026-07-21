import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Help & User Guide</h1>

      <div className="space-y-6">
        <Card title="Dashboard" padding="sm">
          <p className="text-sm text-slate-600">The dashboard shows Process Health grouped by standard. Click any process area to view its details. Use Quick Actions to create assessments or upload evidence.</p>
        </Card>
        <Card title="Requirements & Controls" padding="sm">
          <p className="text-sm text-slate-600">In Process Details, the <strong>Requirements & Controls</strong> tab shows all linked controls grouped by requirement. Click <strong>🗂 Map Controls</strong> to open the side-by-side mapping panel — select unmapped controls on the left and click a requirement on the right to assign them.</p>
          <p className="text-sm text-slate-600 mt-2">Drag-and-drop: click and hold the <strong>⋮⋮</strong> handle to drag a control from one requirement to another.</p>
        </Card>
        <Card title="Assessments" padding="sm">
          <p className="text-sm text-slate-600">Create assessments from the dashboard. Each assessment has 5 tabs:</p>
          <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1 mt-2">
            <li><strong>Overview</strong> — Metadata and progress summary</li>
            <li><strong>Control Assignment</strong> — Select controls to test and mark effectiveness</li>
            <li><strong>Sample Selection</strong> — Collect evidence samples per control</li>
            <li><strong>Finding & Actions</strong> — Record findings and assign remediation actions</li>
            <li><strong>Activities</strong> — Schedule interviews, reviews, and site visits</li>
          </ul>
        </Card>
        <Card title="Company Selector" padding="sm">
          <p className="text-sm text-slate-600">If you have access to multiple companies, a dropdown appears in the header. Select a company to filter all data. SAMS001 is the template company — only visible to administrators.</p>
        </Card>
        <Card title="Gamification" padding="sm">
          <p className="text-sm text-slate-600">Earn points by completing assessments, recording findings, and closing actions. Badges are awarded across 8 emotional drives. The leaderboard shows top performers (admins excluded).</p>
        </Card>
        <Card title="Unmapped Controls" padding="sm">
          <p className="text-sm text-slate-600">Each Process Area has an &ldquo;Unmapped Controls&rdquo; requirement — a holding bucket for controls not yet assigned to a specific requirement. Use <strong>🗂 Map Controls</strong> to move them to the correct requirement.</p>
        </Card>
      </div>
    </div>
  );
}
