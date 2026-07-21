import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DatabasePage() {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") redirect("/fla");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">🗄️ Database Management</h1>
      <p className="text-sm text-slate-500 mb-6">Backup, restore, and export database data</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="💾 Backup & Restore" padding="sm">
          <p className="text-sm text-slate-600 mb-4">Download a full SQL backup or restore from a previously saved file.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/database/backup">
              <Button variant="primary" size="sm">📥 Download Backup</Button>
            </a>
            <form action="/api/admin/database/restore" method="POST" encType="multipart/form-data">
              <div className="flex items-center gap-2">
                <input type="file" name="file" accept=".sql" className="text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-amber-600 file:text-white file:text-xs" />
                <Button variant="warning" size="sm" type="submit">📤 Restore</Button>
              </div>
            </form>
          </div>
        </Card>

        <Card title="📦 Data Exports" padding="sm">
          <p className="text-sm text-slate-600 mb-4">Export SAMS relational data for analysis.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/database/export-controls?format=csv"><Button variant="secondary" size="sm">📥 Controls CSV</Button></a>
            <a href="/api/admin/database/export-controls?format=json"><Button variant="secondary" size="sm">📋 Controls JSON</Button></a>
            <a href="/api/admin/database/export-requirements?format=csv"><Button variant="secondary" size="sm">📥 Requirements CSV</Button></a>
            <a href="/api/admin/database/export-requirements?format=json"><Button variant="secondary" size="sm">📋 Requirements JSON</Button></a>
          </div>
        </Card>
      </div>
    </div>
  );
}
